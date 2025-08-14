import { TierNotFoundError } from '../../../src/services/tiers.service';
import { UserNotFoundError } from '../../../src/services/users.service';
import { getUser, newTier } from '../fixtures';
import { UserType } from '../../../src/core/users/User';
import { Service } from '../../../src/core/users/Tier';
import { createTestServices } from '../helpers/services-factory';

describe('Products Service Tests', () => {
  let services: ReturnType<typeof createTestServices>;

  beforeEach(() => {
    services = createTestServices();
  });

  describe('Finding the higher tier for a user', () => {
    it('When the subscription type is not Individual or Business, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      await expect(
        services.productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.ObjectStorage,
        }),
      ).rejects.toThrow(TierNotFoundError);
    });

    describe('When the subscription type is individual', () => {
      it('When the user has a lifetime subscription, then the higher tier is returned', async () => {
        const mockedUser = getUser({
          lifetime: true,
        });
        const mockedTier = newTier();
        mockedTier.billingType = 'lifetime';

        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(services.tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

        const result = await services.productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.Individual,
        });

        expect(result).toStrictEqual(mockedTier);
        expect(result.billingType).toStrictEqual('lifetime');
      });

      it('When the user has a subscription, then the higher tier is returned', async () => {
        const mockedUser = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;

        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest
          .spyOn(services.tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedTier, mockedBusinessTier]);

        const result = await services.productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.Individual,
        });

        expect(result).toStrictEqual(mockedTier);
        expect(result.billingType).toStrictEqual('subscription');
      });
    });

    describe('When the subscription type is business', () => {
      it('When the user has only one owner Id, then the this subscription tier is returned', async () => {
        const mockedUser = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;

        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest
          .spyOn(services.tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedTier, mockedBusinessTier]);

        const result = await services.productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          ownersId: [mockedUser.uuid],
          subscriptionType: UserType.Business,
        });

        expect(result).toStrictEqual(mockedBusinessTier);
        expect(result.billingType).toStrictEqual('subscription');
      });

      it('When the user has multiple owner Ids, then the highest tier is returned', async () => {
        const mockedUser = getUser();
        const mockedOwner = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        const mockedBusinessTier2 = newTier();

        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 1000000;
        mockedBusinessTier2.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier2.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 2000000;

        jest.spyOn(services.usersService, 'findUserByUuid').mockImplementation(async (uuid: string) => {
          if (uuid === mockedUser.uuid) return mockedUser;
          if (uuid === mockedOwner.uuid) return mockedOwner;
          throw new UserNotFoundError(`User with uuid ${uuid} not found`);
        });
        jest.spyOn(services.tiersService, 'getTiersProductsByUserId').mockImplementation(async (ownerId: string) => {
          if (ownerId === mockedUser.id) {
            return [mockedTier, mockedBusinessTier];
          }
          if (ownerId === mockedOwner.id) {
            return [mockedTier, mockedBusinessTier2];
          }
          return [];
        });

        const result = await services.productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          ownersId: [mockedUser.uuid, mockedOwner.uuid],
          subscriptionType: UserType.Business,
        });

        expect(result).toStrictEqual(mockedBusinessTier2);
        expect(result.billingType).toStrictEqual('subscription');
      });
    });
  });
});
