import { Service } from '../../../src/core/users/Tier';
import { TierNotFoundError } from '../../../src/services/tiers.service';
import { UserNotFoundError } from '../../../src/services/users.service';
import { getUser, newTier } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

describe('Products Service Tests', () => {
  const { productsService, usersService, tiersService } = createTestServices();

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
});
