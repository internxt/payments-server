import Stripe from 'stripe';
import { User } from '../core/users/User';
import { UsersRepository } from '../core/users/UsersRepository';
import { PaymentService } from './PaymentService';
import { DisplayBillingRepository } from '../core/users/MongoDBDisplayBillingRepository';
import { Coupon } from '../core/coupons/Coupon';
import { CouponsRepository } from '../core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../core/coupons/UsersCouponsRepository';

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
  ) {}

  async updateUser(customerId: User['customerId'], body: Pick<User, 'lifetime'>): Promise<void> {
    const updated = this.usersRepository.updateUser(customerId, body);
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

  async cancelUserTeamsSubscriptions(uuid: User['uuid'], teamsUserUuid: User['uuid']) {
    const user = await this.findUserByUuid(uuid);
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(user.customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const subscriptionsToCancel = activeSubscriptions.filter((subscription) => {
      const isTeams = parseInt(subscription.items.data[0].price.metadata.is_teams);

      return isTeams === 1;
    }) as Stripe.Subscription[];

    for (const subscriptionToCancel of subscriptionsToCancel) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async cancelUserIndividualSubscriptions(customerId: User['customerId']): Promise<void> {
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const individualSubscriptions = activeSubscriptions.filter(
      (subscription) => subscription.metadata.is_teams !== '1',
    ) as Stripe.Subscription[];

    for (const subscriptionToCancel of individualSubscriptions) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async shouldDisplayBilling(): Promise<boolean> {
    const billing = await this.displayBillingRepository.find();

    return billing.display;
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
}

export class UserNotFoundError extends Error {}
