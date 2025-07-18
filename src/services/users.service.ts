import Stripe from 'stripe';
import { User } from '../core/users/User';
import { UsersRepository } from '../core/users/UsersRepository';
import { PaymentService } from './payment.service';
import { DisplayBilling, DisplayBillingRepository } from '../core/users/MongoDBDisplayBillingRepository';
import { Coupon } from '../core/coupons/Coupon';
import { CouponsRepository } from '../core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../core/coupons/UsersCouponsRepository';
import { sign } from 'jsonwebtoken';
import { Axios, AxiosRequestConfig } from 'axios';
import { isProduction, type AppConfig } from '../config';
import { VpnFeatures } from '../core/users/Tier';
import { HttpError } from '../errors/HttpError';

function signToken(duration: string, secret: string) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
    ...(!isProduction ? { allowInsecureKeySizes: true } : null),
  });
}

export class CouponNotBeingTrackedError extends Error {
  constructor(couponName: Coupon['code']) {
    super(`Coupon ${couponName} is not being tracked`);

    Object.setPrototypeOf(this, CouponNotBeingTrackedError.prototype);
  }
}

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly paymentService: PaymentService,
    private readonly displayBillingRepository: DisplayBillingRepository,
    private readonly couponsRepository: CouponsRepository,
    private readonly usersCouponsRepository: UsersCouponsRepository,
    private readonly config: AppConfig,
    private readonly axios: Axios,
  ) {}

  async updateUser(customerId: User['customerId'], body: Partial<User>): Promise<void> {
    const updated = await this.usersRepository.updateUser(customerId, body);
    if (!updated) {
      throw new UserNotFoundError();
    }
  }

  async findUserByCustomerID(customerId: User['customerId']): Promise<User> {
    const userFound = await this.usersRepository.findUserByCustomerId(customerId);

    if (!userFound) {
      throw new UserNotFoundError();
    }

    return userFound;
  }

  async findUserByUuid(uuid: User['uuid']): Promise<User> {
    const userFound = await this.usersRepository.findUserByUuid(uuid);
    if (!userFound) {
      throw new UserNotFoundError();
    }

    return userFound;
  }

  async cancelUserIndividualSubscriptions(customerId: User['customerId']): Promise<void> {
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const individualSubscriptions = activeSubscriptions.filter(
      (subscription) => subscription.product?.metadata.type !== 'business',
    ) as Stripe.Subscription[];

    for (const subscriptionToCancel of individualSubscriptions) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async cancelUserB2BSuscriptions(customerId: User['customerId']): Promise<void> {
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const b2bSubscriptions = activeSubscriptions.filter(
      (subs) => subs.product?.metadata.type === 'business',
    ) as Stripe.Subscription[];

    for (const subscriptionToCancel of b2bSubscriptions) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async getDisplayBilling(): Promise<DisplayBilling> {
    const billing = await this.displayBillingRepository.find();

    return billing;
  }

  insertUser(user: Omit<User, 'id'>) {
    return this.usersRepository.insertUser(user);
  }

  /**
   * Stores a new entry on the history of coupons used by a given user
   * @param user The user using the coupon
   * @param couponCode The code of the coupon being used
   */
  async storeCouponUsedByUser(user: User, couponCode: Coupon['code']): Promise<void> {
    const coupon = await this.couponsRepository.findByCode(couponCode);
    const isTracked = !!coupon;

    if (!isTracked) {
      throw new CouponNotBeingTrackedError(couponCode);
    }

    await this.usersCouponsRepository.create({
      coupon: coupon.id,
      user: user.id,
    });
  }

  /**
   * Indicates if the coupon has been used or not by a given user
   * @param user User that could have been used a coupon
   * @param couponCode The coupon code that could have been used
   * @returns A boolean indicating if the coupon has been used or not
   */
  async isCouponBeingUsedByUser(user: User, couponCode: Coupon['code']): Promise<boolean> {
    const coupon = await this.couponsRepository.findByCode(couponCode);
    const isTracked = !!coupon;

    if (!isTracked) {
      return false;
    }

    const userCouponEntry = await this.usersCouponsRepository.findByUserAndCoupon(user.id, coupon.id);

    return !!userCouponEntry;
  }

  /**
   * @description Retrieves the unique coupon codes associated with a given user.
   *
   * @param userId - The ID of the user whose coupons are being retrieved.
   * @returns An array of unique coupon codes associated with the user, or `null` if the user has no coupons.
   */
  async getStoredCouponsByUserId(userId: User['id']): Promise<Coupon['code'][] | null> {
    const coupons = await this.usersCouponsRepository.findCouponsByUserId(userId);
    if (!coupons) return null;

    const couponCodeData = await Promise.all(coupons.map((coupon) => this.couponsRepository.findById(coupon.coupon)));

    const codes = couponCodeData
      .map((coupon) => coupon?.code)
      .filter((code): code is string => typeof code === 'string');

    const uniqueCodes = [...new Set(codes)];

    return uniqueCodes;
  }

  async initializeWorkspace(
    ownerId: string,
    payload: { newStorageBytes: number; seats: number; address?: string; phoneNumber?: string },
  ): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await this.axios.post(
      `${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces`,
      {
        ownerId,
        maxSpaceBytes: payload.newStorageBytes * payload.seats,
        address: payload.address,
        numberOfSeats: payload.seats,
        phoneNumber: payload.phoneNumber,
      },
      params,
    );
  }

  async isWorkspaceUpgradeAllowed(
    ownerId: string,
    workspaceId: string,
    maxSpaceBytes: number,
    seats: number,
  ): Promise<boolean> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);
    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    return this.axios.post(
      `${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces/${workspaceId}/storage/upgrade-check`,
      {
        ownerId,
        maxSpaceBytes: maxSpaceBytes * seats,
        numberOfSeats: seats,
      },
      requestConfig,
    );
  }

  async updateWorkspaceStorage(ownerId: string, maxSpaceBytes: number, seats: number): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);
    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    return this.axios.put(
      `${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces/storage`,
      {
        ownerId,
        maxSpaceBytes: maxSpaceBytes * seats,
        numberOfSeats: seats,
      },
      requestConfig,
    );
  }

  async destroyWorkspace(ownerId: string): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);
    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      data: {
        ownerId,
      },
    };

    await this.axios.delete(`${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces`, requestConfig);
  }

  async findUserByEmail(email: string): Promise<{ data: { uuid: string; email: string } }> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);
    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      params: {
        email,
      },
    };

    return this.axios.get(`${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/users`, requestConfig);
  }

  async enableVPNTier(userUuid: User['uuid'], featureId: VpnFeatures['featureId']): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);

    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    return this.axios.post(
      `${this.config.VPN_URL}/gateway/users`,
      {
        uuid: userUuid,
        tierId: featureId,
      },
      requestConfig,
    );
  }

  async disableVPNTier(userUuid: User['uuid'], featureId: VpnFeatures['featureId']): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET);

    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    return this.axios.delete(`${this.config.VPN_URL}/gateway/users/${userUuid}/tiers/${featureId}`, requestConfig);
  }
}

export class UserNotFoundError extends HttpError {
  constructor(message = 'User Not Found') {
    super(message, 404);
  }
}
