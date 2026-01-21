import { Service } from '../../../src/core/users/Tier';
import { UserNotFoundError } from '../../../src/errors/PaymentErrors';
import { TierNotFoundError } from '../../../src/services/tiers.service';
import { getUser, newTier } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

describe('Products Service Tests', () => {
  const { productsService, usersService, tiersService, userFeaturesOverridesService } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Finding the higher tier for a user', () => {
    it('When the subscription type is not Individual or Business, then an error indicating so is thrown', async () => {
      const tierNotFoundError = new TierNotFoundError('Tier was not found');
      const userNotFoundError = new UserNotFoundError('User was not found');
      const mockedUser = getUser();
      const mockedOwnerUser = getUser();
      const mockedFreeTier = newTier({
        productId: 'free',
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
      jest.spyOn(usersService, 'findUserByUuid').mockRejectedValueOnce(userNotFoundError);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
        ownersId: [mockedOwnerUser.uuid],
      });

      expect(userTier).toStrictEqual(mockedFreeTier);
    });

    describe('User has subscriptions', () => {
      test('When the user only has an individual tier, then the tier is returned correctly', async () => {
        const mockedUser = getUser();
        const mockedFreeTier = newTier({
          productId: 'free',
        });
        const mockedTier = newTier();

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([mockedTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual(mockedTier);
      });

      test('When the user only has an individual tier, then the tier of the subscription is returned correctly', async () => {
        const mockedUser = getUser();
        const mockedFreeTier = newTier({
          productId: 'free',
        });
        const mockedTier = newTier();

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([mockedTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual(mockedTier);
      });

      test('When the user only has a business subscription, then the tier of the subscription is returned correctly', async () => {
        const mockedUser = getUser();
        const mockedFreeTier = newTier({
          productId: 'free',
        });
        const mockedTier = newTier();
        mockedTier.featuresPerService[Service.Drive].workspaces.enabled = true;

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([mockedTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual(mockedTier);
        expect(userTier.featuresPerService[Service.Drive].workspaces.enabled).toBeTruthy();
      });

      test('When the user has both individual and b2b tiers, then the features are merged and all available features are returned', async () => {
        const mockedUser = getUser();
        const mockedFreeTier = newTier({ productId: 'free' });

        const individualTier = newTier({
          productId: 'individual-premium',
          label: 'Premium Individual',
          featuresPerService: {
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 1000,
              foreignTierId: 'individual-random-id',
              workspaces: { enabled: false } as any,
              passwordProtectedSharing: { enabled: true },
              restrictedItemsSharing: { enabled: true },
            },
            [Service.Mail]: {
              enabled: true,
              addressesPerUser: 10,
            },
            [Service.Vpn]: {
              enabled: false,
              featureId: 'vpn-individual-feature',
            },
            [Service.Meet]: {
              enabled: true,
              paxPerCall: 50,
            },
            [Service.Backups]: { enabled: true },
            [Service.Antivirus]: { enabled: true },
            [Service.darkMonitor]: { enabled: false },
            [Service.Cleaner]: { enabled: false },
            [Service.Cli]: { enabled: false },
          },
        });

        const businessTier = newTier({
          productId: 'business-pro',
          label: 'Business Pro',
          featuresPerService: {
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 500,
              foreignTierId: 'business-random-id',
              workspaces: {
                enabled: true,
                maxSpaceBytesPerSeat: 1000,
                minimumSeats: 1,
                maximumSeats: 10,
              },
              passwordProtectedSharing: { enabled: true },
              restrictedItemsSharing: { enabled: true },
            },
            [Service.Vpn]: {
              enabled: true,
              featureId: 'vpn-business-feature',
            },
            [Service.Meet]: {
              enabled: true,
              paxPerCall: 50,
            },
            [Service.Mail]: {
              enabled: false,
              addressesPerUser: 0,
            },
            [Service.Backups]: { enabled: true },
            [Service.Antivirus]: { enabled: true },
            [Service.darkMonitor]: { enabled: true },
            [Service.Cleaner]: { enabled: true },
            [Service.Cli]: { enabled: true },
          },
        });

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([individualTier, businessTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual({
          label: 'Business Pro',
          productId: 'business-pro',
          billingType: businessTier.billingType,
          id: businessTier.id,
          featuresPerService: {
            drive: {
              enabled: true,
              maxSpaceBytes: 1000,
              workspaces: businessTier.featuresPerService[Service.Drive].workspaces,
              passwordProtectedSharing: { enabled: true },
              restrictedItemsSharing: { enabled: true },
            },
            mail: {
              enabled: true,
              addressesPerUser: 10,
            },
            vpn: {
              enabled: true,
              featureId: 'vpn-business-feature',
            },
            meet: {
              enabled: true,
              paxPerCall: 50,
            },
            backups: { enabled: true },
            antivirus: { enabled: true },
            cleaner: { enabled: true },
            darkMonitor: { enabled: true },
            cli: { enabled: true },
          },
        });
      });

      test('When the user has an individual subscription and pertains to a business subscription, then the higher one is returned based on the max space bytes', async () => {
        const mockedUser = getUser();
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier();
        const mockedFreeTier = newTier({
          productId: 'free',
        });
        mockedIndividualTier.featuresPerService[Service.Drive].maxSpaceBytes = 1100;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 1000;

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([mockedIndividualTier]);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([mockedBusinessTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual(mockedIndividualTier);
        expect(userTier.featuresPerService[Service.Drive].workspaces.enabled).toBeFalsy();
      });
    });
  });

  describe('Custom user features overrides', () => {
    test('When user has custom feature overrides, then they are merged to the base tier', async () => {
      const mockedUser = getUser();
      const mockedFreeTier = newTier({ productId: 'free' });
      const mockedBaseTier = newTier();

      const customOverrides = {
        featuresPerService: {
          [Service.Antivirus]: {
            enabled: true,
          },
          [Service.Backups]: {
            enabled: true,
          },
        },
      };

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedBaseTier]);
      jest.spyOn(userFeaturesOverridesService, 'getCustomUserFeatures').mockResolvedValue(customOverrides as any);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(userFeaturesOverridesService.getCustomUserFeatures).toHaveBeenCalledWith(mockedUser.id);
      expect(userTier.featuresPerService[Service.Antivirus]).toStrictEqual(
        customOverrides.featuresPerService[Service.Antivirus],
      );
      expect(userTier.featuresPerService[Service.Backups]).toStrictEqual(
        customOverrides.featuresPerService[Service.Backups],
      );
    });

    test('When user has no custom feature overrides, then base tier is returned unchanged', async () => {
      const mockedUser = getUser();
      const mockedFreeTier = newTier({ productId: 'free' });
      const mockedBaseTier = newTier({
        productId: 'individual-premium',
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedBaseTier]);
      jest.spyOn(userFeaturesOverridesService, 'getCustomUserFeatures').mockResolvedValue(null);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(userFeaturesOverridesService.getCustomUserFeatures).toHaveBeenCalledWith(mockedUser.id);
      expect(userTier).toStrictEqual(mockedBaseTier);
    });

    test('When fetching user for overrides fails, then base tier is returned without overrides', async () => {
      const mockedUser = getUser();
      const userNotFoundError = new UserNotFoundError('User not found');
      const mockedFreeTier = newTier({ productId: 'free' });
      const mockedBaseTier = newTier({
        productId: 'individual-premium',
      });

      jest
        .spyOn(usersService, 'findUserByUuid')
        .mockResolvedValueOnce(mockedUser)
        .mockRejectedValueOnce(userNotFoundError);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedBaseTier]);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(userTier).toStrictEqual(mockedBaseTier);
    });

    test('When user has only free tier and custom overrides, then overrides are merged to free tier', async () => {
      const mockedUser = getUser();
      const mockedFreeTier = newTier({
        productId: 'free',
        featuresPerService: {
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 100,
            foreignTierId: 'free-tier-id',
            workspaces: { enabled: false } as any,
            passwordProtectedSharing: { enabled: false },
            restrictedItemsSharing: { enabled: false },
          },
          [Service.Mail]: { enabled: false, addressesPerUser: 0 },
          [Service.Vpn]: { enabled: false, featureId: 'vpn-free' },
          [Service.Meet]: { enabled: false, paxPerCall: 0 },
          [Service.Backups]: { enabled: false },
          [Service.Antivirus]: { enabled: false },
          [Service.darkMonitor]: { enabled: false },
          [Service.Cleaner]: { enabled: false },
          [Service.Cli]: { enabled: false },
        },
      });

      const customOverrides = {
        featuresPerService: {
          [Service.Backups]: {
            enabled: true,
          },
          [Service.Antivirus]: {
            enabled: true,
          },
        },
      };

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);
      jest.spyOn(userFeaturesOverridesService, 'getCustomUserFeatures').mockResolvedValue(customOverrides as any);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(userTier.productId).toBe('free');
      expect(userTier.featuresPerService[Service.Antivirus].enabled).toBeTruthy();
      expect(userTier.featuresPerService[Service.Backups].enabled).toBeTruthy();
    });
  });
});
