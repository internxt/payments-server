import axios from 'axios';
import Stripe from 'stripe';

import { ExtendedSubscription, PaymentService } from '../../../src/services/payment.service';
import { StorageService } from '../../../src/services/storage.service';
import { CouponNotBeingTrackedError, UserNotFoundError, UsersService } from '../../../src/services/users.service';
import config from '../../../src/config';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import testFactory from '../utils/factory';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { getActiveSubscriptions, getCoupon, getUser, newTier } from '../fixtures';

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;

jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  sign: jest.fn(),
}));

beforeEach(() => {
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  storageService = new StorageService(config, axios);
  productsRepository = testFactory.getProductsRepositoryForTest();
  bit2MeService = new Bit2MeService(config, axios);
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    bit2MeService,
  );

  usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
});

const voidPromise = () => Promise.resolve();

describe('UsersService tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('Insert the user to the database', () => {
    it('When trying to add a user with the correct params, the user is inserted successfully', async () => {
      const mockedUser = getUser();
      await usersService.insertUser({
        customerId: mockedUser.customerId,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });

      expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
      expect(usersRepository.insertUser).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });
    });
  });

  describe('Update existent user values in the database', () => {
    it('When the user is updated successfully, then resolves', async () => {
      const mockedUser = getUser({ lifetime: true });
      (usersRepository.updateUser as jest.Mock).mockResolvedValue(true);

      await expect(
        usersService.updateUser(mockedUser.customerId, { lifetime: mockedUser.lifetime }),
      ).resolves.toBeUndefined();

      expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
      expect(usersRepository.updateUser).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: true,
      });
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser({ lifetime: true });
      (usersRepository.updateUser as jest.Mock).mockImplementation(() =>
        Promise.reject(new UserNotFoundError('User not found')),
      );

      await expect(usersService.updateUser(mockedUser.customerId, { lifetime: mockedUser.lifetime })).rejects.toThrow(
        UserNotFoundError,
      );

      expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('Find user by his Customer Id', () => {
    it('When looking for a customer by its customer ID and exists, then the user is returned', async () => {
      const mockedUser = getUser();
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);

      const result = await usersService.findUserByCustomerID(mockedUser.customerId);

      expect(result).toStrictEqual(mockedUser);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedUser.customerId);
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByCustomerID(mockedUser.customerId)).rejects.toThrow(UserNotFoundError);

      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedUser.customerId);
    });
  });

  describe('Find customer by User UUId', () => {
    it('When looking for a customer by UUID with the correct params, then the customer is found', async () => {
      const mockedUser = getUser();
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(mockedUser);

      const result = await usersService.findUserByUuid(mockedUser.uuid);

      expect(result).toStrictEqual(mockedUser);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mockedUser.uuid);
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByUuid(mockedUser.uuid)).rejects.toThrow(UserNotFoundError);

      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mockedUser.uuid);
    });
  });

  describe('Cancel user subscription', () => {
    describe('Cancel the user Individual subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plan is cancelled and the storage is restored', async () => {
        const mockedUser = getUser();
        const mockedSubscriptions = getActiveSubscriptions();
        jest
          .spyOn(paymentService, 'getActiveSubscriptions')
          .mockImplementation(() =>
            Promise.resolve(
              mockedSubscriptions.filter(
                (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type !== 'business',
              ) as unknown as ExtendedSubscription[],
            ),
          );

        const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await usersService.cancelUserIndividualSubscriptions(mockedUser.customerId);
        await storageService.changeStorage(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

        const individualSubscriptions = mockedSubscriptions.filter(
          (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type !== 'business',
        );
        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(individualSubscriptions.length);

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
      });
    });

    describe('Cancel the user B2B subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plans are cancelled', async () => {
        const mockedUser = getUser();
        const mockedSubscriptions = getActiveSubscriptions();
        jest
          .spyOn(paymentService, 'getActiveSubscriptions')
          .mockImplementation(() => Promise.resolve(mockedSubscriptions as unknown as ExtendedSubscription[]));

        const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await usersService.cancelUserB2BSuscriptions(mockedUser.customerId);
        await storageService.changeStorage(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

        const b2bSubscriptions = mockedSubscriptions.filter(
          (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type === 'business',
        );

        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(b2bSubscriptions.length);

        b2bSubscriptions.forEach((sub) => {
          expect(cancelSubscriptionSpy).toHaveBeenCalledWith(sub.id);
        });

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
      });
    });
  });

  describe('Storing coupon user by user', () => {
    it('When the coupon is tracked, then the coupon is stored correctly', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);

      await usersService.storeCouponUsedByUser(mockedUser, mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(usersCouponsRepository.create).toHaveBeenCalledWith({
        user: mockedUser.id,
        coupon: mockedCoupon.id,
      });
    });
    it('when the coupon is not tracked, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      await expect(usersService.storeCouponUsedByUser(mockedUser, mockedCoupon.code)).rejects.toThrow(
        CouponNotBeingTrackedError,
      );

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(usersCouponsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('Verify if the user used a tracked coupon code', () => {
    it('When the coupon is tracked and used by the user, then returns true', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue({ id: 'entry1' });

      const result = await usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(mockedUser.id, mockedCoupon.id);
      expect(result).toBe(true);
    });

    it('When the coupon is tracked but not used by the user, then returns false', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(mockedUser.id, mockedCoupon.id);
      expect(result).toBe(false);
    });

    it('When the coupon is not tracked, then returns false', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('Enable the VPN feature based on the tier', () => {
    it('When called with a userUuid and tier, then enables the VPN for the user', async () => {
      const mockedUser = getUser({ lifetime: true });
      const userUuid = mockedUser.uuid;
      const tier = newTier().featuresPerService['vpn'].featureId;

      const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({} as any);

      await usersService.enableVPNTier(userUuid, tier);

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${config.VPN_URL}/gateway/users`,
        { uuid: userUuid, tierId: tier },
        expect.anything(),
      );
    });
  });

  describe('Disable the VPN feature', () => {
    it('When called with a userUuid and tier, then disables the VPN for the user', async () => {
      const mockedUser = getUser({ lifetime: true });
      const userUuid = mockedUser.uuid;
      const tier = newTier().featuresPerService['vpn'].featureId;

      const axiosPostSpy = jest.spyOn(axios, 'delete').mockResolvedValue({} as any);

      await usersService.disableVPNTier(userUuid, tier);

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      expect(axiosPostSpy).toHaveBeenCalledWith(`${config.VPN_URL}/gateway/users`, {
        data: { uuid: userUuid, tierId: tier },
        headers: {
          Authorization: 'Bearer undefined',
          'Content-Type': 'application/json',
        },
      });
    });
  });
});
