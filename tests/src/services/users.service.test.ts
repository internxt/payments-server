import axios from 'axios';
import Stripe from 'stripe';

import { ExtendedSubscription } from '../../../src/types/stripe';
import config from '../../../src/config';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { getActiveSubscriptions, getCoupon, getCustomer, getUser, newTier, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';
import { Service } from '../../../src/core/users/Tier';
import { UserNotFoundError } from '../../../src/errors/PaymentErrors';
import { CouponNotBeingTrackedError } from '../../../src/errors/UsersErrors';

jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  sign: jest.fn(),
}));

describe('UsersService tests', () => {
  const { usersRepository, usersService, usersCouponsRepository, couponsRepository, paymentService, storageService } =
    createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('Update existent user values', () => {
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

  describe('Find customer by User UUID', () => {
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

  describe('Workspaces', () => {
    test('When initializing the workspace, then the workspace is initialized using the correct params', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const mockedCustomer = getCustomer();
      const amountOfSeats = 5;

      const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({} as any);

      await usersService.initializeWorkspace(userWithEmail.uuid, {
        newStorageBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        seats: amountOfSeats,
        address: mockedCustomer.address?.line1 ?? undefined,
        phoneNumber: mockedCustomer.phone ?? undefined,
        tierId: tier.featuresPerService[Service.Drive].foreignTierId,
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${process.env.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces`,
        {
          ownerId: userWithEmail.uuid,
          maxSpaceBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat * amountOfSeats,
          numberOfSeats: amountOfSeats,
          address: mockedCustomer.address?.line1 ?? undefined,
          phoneNumber: mockedCustomer.phone ?? undefined,
          tierId: tier.featuresPerService[Service.Drive].foreignTierId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer undefined',
          },
        },
      );
    });

    test('When updating the workspace, then the workspace is updated using the correct params', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const amountOfSeats = 5;

      const axiosPostSpy = jest.spyOn(axios, 'patch').mockResolvedValue({} as any);

      await usersService.updateWorkspace({
        ownerId: userWithEmail.uuid,
        maxSpaceBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        seats: amountOfSeats,
        tierId: tier.featuresPerService[Service.Drive].foreignTierId,
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${process.env.DRIVE_NEW_GATEWAY_URL}/gateway/workspaces`,
        {
          ownerId: userWithEmail.uuid,
          maxSpaceBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat * amountOfSeats,
          numberOfSeats: amountOfSeats,
          tierId: tier.featuresPerService[Service.Drive].foreignTierId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer undefined',
          },
        },
      );
    });
  });

  describe('Cancel user subscription', () => {
    describe('Cancel the user Individual subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plan is cancelled and the storage is restored', async () => {
        const mockedUser = getUser();
        const mockedSubscriptions = getActiveSubscriptions();
        const mockedFreeTier = newTier({
          featuresPerService: {
            drive: {
              maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
              foreignTierId: 'free-id',
            },
          } as any,
        });
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
        const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockImplementation(voidPromise);

        await usersService.cancelUserIndividualSubscriptions(mockedUser.customerId);
        await storageService.updateUserStorageAndTier(
          mockedUser.uuid,
          mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
          mockedFreeTier.featuresPerService.drive.foreignTierId,
        );

        const individualSubscriptions = mockedSubscriptions.filter(
          (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type !== 'business',
        );
        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(individualSubscriptions.length);

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(
          mockedUser.uuid,
          mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
          mockedFreeTier.featuresPerService.drive.foreignTierId,
        );
      });
    });

    describe('Cancel the user B2B subscription', () => {
      it('When the customer wants to cancel the individual subscription, then the Stripe plans are cancelled', async () => {
        const mockedUser = getUser();
        const mockedSubscriptions = getActiveSubscriptions();
        const mockedFreeTier = newTier({
          featuresPerService: {
            drive: {
              maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
              foreignTierId: 'free-id',
            },
          } as any,
        });
        jest
          .spyOn(paymentService, 'getActiveSubscriptions')
          .mockImplementation(() => Promise.resolve(mockedSubscriptions as unknown as ExtendedSubscription[]));

        const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

        const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockImplementation(voidPromise);

        await usersService.cancelUserB2BSuscriptions(mockedUser.customerId);
        await storageService.updateUserStorageAndTier(
          mockedUser.uuid,
          mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
          mockedFreeTier.featuresPerService.drive.foreignTierId,
        );

        const b2bSubscriptions = mockedSubscriptions.filter(
          (sub) => (sub.items.data[0].plan.product as Stripe.Product).metadata.type === 'business',
        );

        expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(b2bSubscriptions.length);

        b2bSubscriptions.forEach((sub) => {
          expect(cancelSubscriptionSpy).toHaveBeenCalledWith(sub.id);
        });

        expect(changeStorageSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).toHaveBeenCalledWith(
          mockedUser.uuid,
          mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
          mockedFreeTier.featuresPerService.drive.foreignTierId,
        );
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

  describe('Fetch all coupons linked to a user', () => {
    it('When the user does not have any coupon associated, then nothing is returned', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersCouponsRepository, 'findCouponsByUserId').mockResolvedValue(null);

      const result = await usersService.getStoredCouponsByUserId(mockedUser.id);

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

      jest.spyOn(usersCouponsRepository, 'findCouponsByUserId').mockResolvedValue(mockedUserCoupons);
      jest.spyOn(couponsRepository, 'findById').mockImplementation(async (id: string) => {
        if (id === coupon1.id) return coupon1;
        if (id === coupon2.id) return coupon2;
        return null;
      });

      const result = await usersService.getStoredCouponsByUserId(mockedUser.id);

      expect(result).toStrictEqual([coupon1.code, coupon2.code]);
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
      const featureId = newTier().featuresPerService['vpn'].featureId;

      const axiosPostSpy = jest.spyOn(axios, 'delete').mockResolvedValue({} as any);

      await usersService.disableVPNTier(userUuid, featureId);

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      expect(axiosPostSpy).toHaveBeenCalledWith(`${config.VPN_URL}/gateway/users/${userUuid}/tiers/${featureId}`, {
        headers: {
          Authorization: 'Bearer undefined',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('Override Drive Limit', () => {
    test('When called with a feature, then overrides the drive limit for the user', async () => {
      const mockedUser = getUser({ lifetime: true });
      const userUuid = mockedUser.uuid;
      const feature = Service.Cli;

      const axiosPostSpy = jest.spyOn(axios, 'put').mockResolvedValue({});

      await usersService.overrideDriveLimit({ userUuid, feature, enabled: true });

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${config.DRIVE_NEW_GATEWAY_URL}/gateway/users/${userUuid}/limits/overrides`,
        {
          feature,
          value: 'true',
        },
        {
          headers: {
            Authorization: 'Bearer undefined',
            'Content-Type': 'application/json',
          },
        },
      );
    });
  });
});
