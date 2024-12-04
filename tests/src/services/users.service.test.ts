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
import getMocks from '../mocks';
import { Bit2MeService } from '../../../src/services/bit2me.service';

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;

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

const mocks = getMocks();

describe('UsersService tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('Insert User in Mongo DB', () => {
    it('When trying to add a user with the correct params, the user is inserted successfully', async () => {
      await usersService.insertUser({
        customerId: mocks.mockedUserWithoutLifetime.customerId,
        uuid: mocks.mockedUserWithoutLifetime.uuid,
        lifetime: true,
      });

      expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
      expect(usersRepository.insertUser).toHaveBeenCalledWith({
        customerId: mocks.mockedUserWithoutLifetime.customerId,
        uuid: mocks.mockedUserWithoutLifetime.uuid,
        lifetime: true,
      });
    });
  });

  describe('Find customer by Customer ID', () => {
    it('When looking for a customer by its ID with the correct params, then the customer is found', async () => {
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mocks.mockedUserWithoutLifetime);

      const result = await usersService.findUserByCustomerID(mocks.mockedUserWithoutLifetime.customerId);

      expect(result).toStrictEqual(mocks.mockedUserWithoutLifetime);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.customerId);
    });

    it('when no user is found by customerId, then an UserNotFoundError is thrown', async () => {
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByCustomerID(mocks.mockedUserWithoutLifetime.customerId)).rejects.toThrow(
        UserNotFoundError,
      );

      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.customerId);
    });
  });

  describe('Find customer by User UUId', () => {
    it('When looking for a customer by UUID with the correct params, then the customer is found', async () => {
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(mocks.mockedUserWithoutLifetime);

      const result = await usersService.findUserByUuid(mocks.mockedUserWithoutLifetime.uuid);

      expect(result).toStrictEqual(mocks.mockedUserWithoutLifetime);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.uuid);
    });

    it('when no user is found by UUID then should throw UserNotFoundError', async () => {
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByUuid(mocks.mockedUserWithoutLifetime.uuid)).rejects.toThrow(
        UserNotFoundError,
      );

      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.uuid);
    });
  });

  describe('Cancelling user subscription', () => {
    describe('Cancel the user individual subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plan is cancelled and the storage is restored', async () => {
        jest
          .spyOn(paymentService, 'getActiveSubscriptions')
          .mockImplementation(() =>
            Promise.resolve(
              mocks.mockActiveSubscriptions.filter(
                (sub) => sub.product?.metadata.type !== 'business',
              ) as unknown as ExtendedSubscription[],
            ),
          );
        const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await usersService.cancelUserIndividualSubscriptions(mocks.mockedUserWithoutLifetime.customerId);
        await storageService.changeStorage(mocks.mockedUserWithoutLifetime.uuid, FREE_PLAN_BYTES_SPACE);

        const individualSubscriptions = mocks.mockActiveSubscriptions.filter(
          (sub) => sub.product?.metadata.type !== 'business',
        );
        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(individualSubscriptions.length);

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.uuid, FREE_PLAN_BYTES_SPACE);
      });
    });

    describe('Cancel the user B2B subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plans are cancelled', async () => {
        jest
          .spyOn(paymentService, 'getActiveSubscriptions')
          .mockImplementation(() =>
            Promise.resolve(mocks.mockActiveSubscriptions as unknown as ExtendedSubscription[]),
          );

        const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await usersService.cancelUserB2BSuscriptions(mocks.mockedUserWithoutLifetime.customerId);
        await storageService.changeStorage(mocks.mockedUserWithoutLifetime.uuid, FREE_PLAN_BYTES_SPACE);

        const b2bSubscriptions = mocks.mockActiveSubscriptions.filter(
          (sub) => sub.product?.metadata.type === 'business',
        );

        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(b2bSubscriptions.length);

        b2bSubscriptions.forEach((sub) => {
          expect(cancelSubscriptionSpy).toHaveBeenCalledWith(sub.id);
        });

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(mocks.mockedUserWithoutLifetime.uuid, FREE_PLAN_BYTES_SPACE);
      });
    });
  });

  describe('Storing coupon user by user', () => {
    it('When the coupon is tracked, then the coupon is stored correctly', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);

      await usersService.storeCouponUsedByUser(mocks.mockedUserWithoutLifetime, mocks.mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.create).toHaveBeenCalledWith({
        coupon: mocks.mockedCoupon.id,
        user: mocks.mockedUserWithoutLifetime.id,
      });
    });

    it('when the coupon is not tracked, then the an CouponNotBeingTrackedError is thrown', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      await expect(
        usersService.storeCouponUsedByUser(mocks.mockedUserWithoutLifetime, mocks.couponName.invalid),
      ).rejects.toThrow(CouponNotBeingTrackedError);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.couponName.invalid);
      expect(usersCouponsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('isCouponBeingUsedByUser', () => {
    it('When the coupon is tracked and used by the user, then returns true', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue({ id: 'entry1' });

      const result = await usersService.isCouponBeingUsedByUser(
        mocks.mockedUserWithoutLifetime,
        mocks.mockedCoupon.code,
      );

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(
        mocks.mockedUserWithoutLifetime.id,
        mocks.mockedCoupon.id,
      );
      expect(result).toBe(true);
    });

    it('When the coupon is tracked but not used by the user, then returns false', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(
        mocks.mockedUserWithoutLifetime,
        mocks.mockedCoupon.code,
      );

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(
        mocks.mockedUserWithoutLifetime.id,
        mocks.mockedCoupon.id,
      );
      expect(result).toBe(false);
    });

    it('When the coupon is not tracked, then returns false', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(
        mocks.mockedUserWithoutLifetime,
        mocks.couponName.invalid,
      );

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.couponName.invalid);
      expect(usersCouponsRepository.findByUserAndCoupon).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
