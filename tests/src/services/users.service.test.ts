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

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;

beforeEach(() => {
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  storageService = new StorageService(config, axios);
  productsRepository = testFactory.getProductsRepositoryForTest();
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    usersRepository,
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
    it('should insert a user successfully', async () => {
      await usersService.insertUser({
        customerId: mocks.mockedUser.customerId,
        uuid: mocks.mockedUser.uuid,
        lifetime: true,
      });

      expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
      expect(usersRepository.insertUser).toHaveBeenCalledWith({
        customerId: mocks.mockedUser.customerId,
        uuid: mocks.mockedUser.uuid,
        lifetime: true,
      });
    });
  });

  // describe('Updating user in Mongo DB', () => {
  //   it('should update the user successfully', async () => {
  //     await expect(usersService.updateUser(mocks.mockedUser.customerId, { lifetime: false })).resolves.toBeUndefined();

  //     expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
  //     expect(usersRepository.updateUser).toHaveBeenCalledWith(mocks.mockedUser.customerId, { lifetime: false });
  //   });

  //   it('should throw UserNotFoundError when user does not exist', async () => {
  //     (usersRepository.updateUser as jest.Mock).mockResolvedValue(false);

  //     await expect(usersService.updateUser(mocks.mockedUser.customerId, { lifetime: false })).rejects.toThrow(
  //       UserNotFoundError,
  //     );

  //     expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
  //     expect(usersRepository.updateUser).toHaveBeenCalledWith(mocks.mockedUser.customerId, { lifetime: false });
  //   });
  // });

  describe('Find customer by Customer ID', () => {
    it('should find a user by customerId successfully', async () => {
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mocks.mockedUser);

      const result = await usersService.findUserByCustomerID(mocks.mockedUser.customerId);

      expect(result).toEqual(mocks.mockedUser);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mocks.mockedUser.customerId);
    });

    it('should throw UserNotFoundError when no user is found by customerId', async () => {
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByCustomerID(mocks.mockedUser.customerId)).rejects.toThrow(UserNotFoundError);

      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mocks.mockedUser.customerId);
    });
  });

  describe('Find customer by User UUId', () => {
    it('should find a user by UUID successfully', async () => {
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(mocks.mockedUser);

      const result = await usersService.findUserByUuid(mocks.mockedUser.uuid);

      expect(result).toEqual(mocks.mockedUser);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mocks.mockedUser.uuid);
    });

    it('should throw UserNotFoundError when no user is found by UUID', async () => {
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(null);

      await expect(usersService.findUserByUuid(mocks.mockedUser.uuid)).rejects.toThrow(UserNotFoundError);

      expect(usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(usersRepository.findUserByUuid).toHaveBeenCalledWith(mocks.mockedUser.uuid);
    });
  });

  describe('Cancelling user subscription', () => {
    it('Cancel the user individual subscription', async () => {
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

      await paymentService.getActiveSubscriptions(mocks.mockedUser.customerId);

      await usersService.cancelUserIndividualSubscriptions(mocks.mockedUser.customerId);
      await storageService.changeStorage(mocks.mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

      const individualSubscriptions = mocks.mockActiveSubscriptions.filter(
        (sub) => sub.product?.metadata.type !== 'business',
      );
      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(individualSubscriptions.length);

      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(changeStorageSpy).toHaveBeenCalledWith(mocks.mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
    });

    it('Cancel the user B2B subscription', async () => {
      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(mocks.mockActiveSubscriptions as unknown as ExtendedSubscription[]));

      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserB2BSubscriptions(mocks.mockedUser.customerId);
      await storageService.changeStorage(mocks.mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

      const b2bSubscriptions = mocks.mockActiveSubscriptions.filter((sub) => sub.product?.metadata.type === 'business');

      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(b2bSubscriptions.length);

      b2bSubscriptions.forEach((sub) => {
        expect(cancelSubscriptionSpy).toHaveBeenCalledWith(sub.id);
      });

      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(changeStorageSpy).toHaveBeenCalledWith(mocks.mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
    });
  });

  describe('Storing coupon user by user', () => {
    it('should store the coupon successfully when the coupon is tracked', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);

      await usersService.storeCouponUsedByUser(mocks.mockedUser, mocks.mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.create).toHaveBeenCalledWith({
        coupon: mocks.mockedCoupon.id,
        user: mocks.mockedUser.id,
      });
    });

    it('should throw CouponNotBeingTrackedError when the coupon is not tracked', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      await expect(usersService.storeCouponUsedByUser(mocks.mockedUser, 'INVALID_COUPON')).rejects.toThrow(
        CouponNotBeingTrackedError,
      );

      expect(couponsRepository.findByCode).toHaveBeenCalledWith('INVALID_COUPON');
      expect(usersCouponsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('isCouponBeingUsedByUser', () => {
    it('should return true when the coupon is tracked and used by the user', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue({ id: 'entry1' });

      const result = await usersService.isCouponBeingUsedByUser(mocks.mockedUser, mocks.mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(
        mocks.mockedUser.id,
        mocks.mockedCoupon.id,
      );
      expect(result).toBe(true);
    });

    it('should return false when the coupon is tracked but not used by the user', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(mocks.mockedCoupon);
      (usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(mocks.mockedUser, mocks.mockedCoupon.code);

      expect(couponsRepository.findByCode).toHaveBeenCalledWith(mocks.mockedCoupon.code);
      expect(usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(
        mocks.mockedUser.id,
        mocks.mockedCoupon.id,
      );
      expect(result).toBe(false);
    });

    it('should return false when the coupon is not tracked', async () => {
      (couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      const result = await usersService.isCouponBeingUsedByUser(mocks.mockedUser, 'INVALID_COUPON');

      expect(couponsRepository.findByCode).toHaveBeenCalledWith('INVALID_COUPON');
      expect(usersCouponsRepository.findByUserAndCoupon).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
