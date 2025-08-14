import axios from 'axios';
import Stripe from 'stripe';

import { ExtendedSubscription } from '../../../src/services/payment.service';
import { CouponNotBeingTrackedError, UserNotFoundError } from '../../../src/services/users.service';
import config from '../../../src/config';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { getActiveSubscriptions, getCoupon, getUser, newTier, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  sign: jest.fn(),
}));

describe('UsersService tests', () => {
  let services: ReturnType<typeof createTestServices>;

  beforeEach(() => {
    services = createTestServices();
    jest.restoreAllMocks();
  });

  describe('Insert the user to the database', () => {
    it('When trying to add a user with the correct params, the user is inserted successfully', async () => {
      const mockedUser = getUser();
      await services.usersService.insertUser({
        customerId: mockedUser.customerId,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });

      expect(services.usersRepository.insertUser).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.insertUser).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });
    });
  });

  describe('Update existent user values', () => {
    it('When the user is updated successfully, then resolves', async () => {
      const mockedUser = getUser({ lifetime: true });
      (services.usersRepository.updateUser as jest.Mock).mockResolvedValue(true);

      await expect(
        services.usersService.updateUser(mockedUser.customerId, { lifetime: mockedUser.lifetime }),
      ).resolves.toBeUndefined();

      expect(services.usersRepository.updateUser).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.updateUser).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: true,
      });
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser({ lifetime: true });
      (services.usersRepository.updateUser as jest.Mock).mockImplementation(() =>
        Promise.reject(new UserNotFoundError('User not found')),
      );

      await expect(
        services.usersService.updateUser(mockedUser.customerId, { lifetime: mockedUser.lifetime }),
      ).rejects.toThrow(UserNotFoundError);

      expect(services.usersRepository.updateUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('Find user by his Customer Id', () => {
    it('When looking for a customer by its customer ID and exists, then the user is returned', async () => {
      const mockedUser = getUser();
      (services.usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);

      const result = await services.usersService.findUserByCustomerID(mockedUser.customerId);

      expect(result).toStrictEqual(mockedUser);
      expect(services.usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedUser.customerId);
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      (services.usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(null);

      await expect(services.usersService.findUserByCustomerID(mockedUser.customerId)).rejects.toThrow(
        UserNotFoundError,
      );

      expect(services.usersRepository.findUserByCustomerId).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedUser.customerId);
    });
  });

  describe('Find customer by User UUId', () => {
    it('When looking for a customer by UUID with the correct params, then the customer is found', async () => {
      const mockedUser = getUser();
      (services.usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(mockedUser);

      const result = await services.usersService.findUserByUuid(mockedUser.uuid);

      expect(result).toStrictEqual(mockedUser);
      expect(services.usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.findUserByUuid).toHaveBeenCalledWith(mockedUser.uuid);
    });

    it('When a user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      (services.usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(null);

      await expect(services.usersService.findUserByUuid(mockedUser.uuid)).rejects.toThrow(UserNotFoundError);

      expect(services.usersRepository.findUserByUuid).toHaveBeenCalledTimes(1);
      expect(services.usersRepository.findUserByUuid).toHaveBeenCalledWith(mockedUser.uuid);
    });
  });

  describe('Cancel user subscription', () => {
    describe('Cancel the user Individual subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plan is cancelled and the storage is restored', async () => {
        const mockedUser = getUser();
        const mockedSubscriptions = getActiveSubscriptions();
        jest
          .spyOn(services.paymentService, 'getActiveSubscriptions')
          .mockImplementation(() =>
            Promise.resolve(
              mockedSubscriptions.filter(
                (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type !== 'business',
              ) as unknown as ExtendedSubscription[],
            ),
          );

        const cancelSubscriptionSpy = jest
          .spyOn(services.paymentService, 'cancelSubscription')
          .mockImplementation(voidPromise);
        const changeStorageSpy = jest.spyOn(services.storageService, 'changeStorage').mockImplementation(voidPromise);

        await services.usersService.cancelUserIndividualSubscriptions(mockedUser.customerId);
        await services.storageService.changeStorage(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

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
          .spyOn(services.paymentService, 'getActiveSubscriptions')
          .mockImplementation(() => Promise.resolve(mockedSubscriptions as unknown as ExtendedSubscription[]));

        const cancelSubscriptionSpy = jest
          .spyOn(services.paymentService, 'cancelSubscription')
          .mockImplementation(voidPromise);

        const changeStorageSpy = jest.spyOn(services.storageService, 'changeStorage').mockImplementation(voidPromise);

        await services.usersService.cancelUserB2BSuscriptions(mockedUser.customerId);
        await services.storageService.changeStorage(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);

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
      (services.couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);

      await services.usersService.storeCouponUsedByUser(mockedUser, mockedCoupon.code);

      expect(services.couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(services.usersCouponsRepository.create).toHaveBeenCalledWith({
        user: mockedUser.id,
        coupon: mockedCoupon.id,
      });
    });
    it('when the coupon is not tracked, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (services.couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      await expect(services.usersService.storeCouponUsedByUser(mockedUser, mockedCoupon.code)).rejects.toThrow(
        CouponNotBeingTrackedError,
      );

      expect(services.couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(services.usersCouponsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('Verify if the user used a tracked coupon code', () => {
    it('When the coupon is tracked and used by the user, then returns true', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (services.couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);
      (services.usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue({ id: 'entry1' });

      const result = await services.usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(services.couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(services.usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(mockedUser.id, mockedCoupon.id);
      expect(result).toBe(true);
    });

    it('When the coupon is tracked but not used by the user, then returns false', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (services.couponsRepository.findByCode as jest.Mock).mockResolvedValue(mockedCoupon);
      (services.usersCouponsRepository.findByUserAndCoupon as jest.Mock).mockResolvedValue(null);

      const result = await services.usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(services.couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(services.usersCouponsRepository.findByUserAndCoupon).toHaveBeenCalledWith(mockedUser.id, mockedCoupon.id);
      expect(result).toBe(false);
    });

    it('When the coupon is not tracked, then returns false', async () => {
      const mockedUser = getUser();
      const mockedCoupon = getCoupon();
      (services.couponsRepository.findByCode as jest.Mock).mockResolvedValue(null);

      const result = await services.usersService.isCouponBeingUsedByUser(mockedUser, mockedCoupon.code);

      expect(services.couponsRepository.findByCode).toHaveBeenCalledWith(mockedCoupon.code);
      expect(services.usersCouponsRepository.findByUserAndCoupon).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('Fetch all coupons linked to a user', () => {
    it('When the user does not have any coupon associated, then nothing is returned', async () => {
      const mockedUser = getUser();
      jest.spyOn(services.usersCouponsRepository, 'findCouponsByUserId').mockResolvedValue(null);

      const result = await services.usersService.getStoredCouponsByUserId(mockedUser.id);

      expect(result).toBeNull();
    });

    it('When the user has associated coupons, then the Coupon IDs (not ID collection) are returned from the local DB', async () => {
      const mockedUser = getUser();
      const coupon1 = getCoupon();
      const coupon2 = getCoupon({ code: 'CoUP0n2' });
      const mockedUserCoupons = [
        {
          id: 'relation-1',
          coupon: coupon1.id,
          user: mockedUser.id,
        },
        {
          id: 'relation-2',
          coupon: coupon2.id,
          user: mockedUser.id,
        },
      ];

      jest.spyOn(services.usersCouponsRepository, 'findCouponsByUserId').mockResolvedValue(mockedUserCoupons);
      jest.spyOn(services.couponsRepository, 'findById').mockImplementation(async (id: string) => {
        if (id === coupon1.id) return coupon1;
        if (id === coupon2.id) return coupon2;
        return null;
      });

      const result = await services.usersService.getStoredCouponsByUserId(mockedUser.id);

      expect(result).toStrictEqual([coupon1.code, coupon2.code]);
    });
  });

  describe('Enable the VPN feature based on the tier', () => {
    it('When called with a userUuid and tier, then enables the VPN for the user', async () => {
      const mockedUser = getUser({ lifetime: true });
      const userUuid = mockedUser.uuid;
      const tier = newTier().featuresPerService['vpn'].featureId;

      const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({} as any);

      await services.usersService.enableVPNTier(userUuid, tier);

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
      const featureId = newTier().featuresPerService['vpn'].featureId;

      const axiosPostSpy = jest.spyOn(axios, 'delete').mockResolvedValue({} as any);

      await services.usersService.disableVPNTier(userUuid, featureId);

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      expect(axiosPostSpy).toHaveBeenCalledWith(`${config.VPN_URL}/gateway/users/${userUuid}/tiers/${featureId}`, {
        headers: {
          Authorization: 'Bearer undefined',
          'Content-Type': 'application/json',
        },
      });
    });
  });
});
