import { Service } from '../../../src/core/users/Tier';
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
      const mockedUser = getUser();
      const mockedFreeTier = newTier({
        productId: 'free',
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValueOnce([]);

      const userTier = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
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

      test('When the user has an individual subscription and a business subscription, then the higher one is returned based on the max space bytes', async () => {
        const mockedUser = getUser();
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier();
        const mockedFreeTier = newTier({
          productId: 'free',
        });
        mockedIndividualTier.featuresPerService[Service.Drive].maxSpaceBytes = 1000;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 1100;

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValueOnce(mockedUser);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValueOnce(mockedFreeTier);
        jest
          .spyOn(tiersService, 'getTiersProductsByUserId')
          .mockResolvedValueOnce([mockedIndividualTier, mockedBusinessTier]);

        const userTier = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
        });

        expect(userTier).toStrictEqual(mockedBusinessTier);
        expect(userTier.featuresPerService[Service.Drive].workspaces.enabled).toBeTruthy();
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
