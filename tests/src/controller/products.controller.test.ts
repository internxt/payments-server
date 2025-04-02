import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUser, getValidAuthToken, newTier } from '../fixtures';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { TiersService } from '../../../src/services/tiers.service';
import { NotFoundSubscriptionError } from '../../../src/services/payment.service';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Testing products endpoints', () => {
  describe('Fetching products available for user', () => {
    it('When the user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(new UserNotFoundError('User not found'));

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('When the user exists but does not have an active subscription or lifetime, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      const getProductsTierSpy = jest
        .spyOn(TiersService.prototype, 'getProductsTier')
        .mockRejectedValue(new NotFoundSubscriptionError('User has no active subscriptions'));

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(getProductsTierSpy).toHaveBeenCalledWith(mockedUser.customerId, mockedUser.lifetime);
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(mockedUser);
      jest.spyOn(TiersService.prototype, 'getProductsTier').mockRejectedValue(new Error('Unexpected error'));

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('When the user is found and has a valid subscription, then the user is able to use the products', async () => {
      const mockedAvailableUserProducts = {
        featuresPerService: {
          antivirus: true,
          backups: true,
        },
      };
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      const getProductsTierSpy = jest
        .spyOn(TiersService.prototype, 'getProductsTier')
        .mockResolvedValue(mockedAvailableUserProducts);

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedAvailableUserProducts);
      expect(getProductsTierSpy).toHaveBeenCalledWith(mockedUser.customerId, mockedUser.lifetime);
    });
  });

  describe('Fetching tier for user', () => {
    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(new Error('Unexpected error'));

      const response = await app.inject({
        path: `/products/tier`,
        method: 'GET',
        headers: { Authorization: `Bearer ${mockedUserToken}` },
      });

      expect(response.statusCode).toBe(500);
    });

    describe('When the subscription type is individual', () => {
      it('When the user is not found, then the free tier is returned successfully', async () => {
        const mockedUser = getUser();
        const mockedFreeTier = newTier({
          id: 'free',
          label: 'free',
          productId: 'free',
        });
        const mockedUserToken = getValidAuthToken(mockedUser.uuid);
        jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(new UserNotFoundError('User not found'));
        jest.spyOn(TiersService.prototype, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);

        const response = await app.inject({
          path: `/products/tier`,
          method: 'GET',
          headers: { Authorization: `Bearer ${mockedUserToken}` },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual(mockedFreeTier);
      });

      it('When the user is found and has a valid subscription, then individual tier is returned successfully', async () => {
        const mockedUser = getUser();
        const mockedUserToken = getValidAuthToken(mockedUser.uuid);
        const mockedTier = newTier();
        jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

        const response = await app.inject({
          path: `/products/tier`,
          method: 'GET',
          headers: { Authorization: `Bearer ${mockedUserToken}` },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual(mockedTier);
      });
    });

    describe('When the subscription type is business', () => {
      it('When the user does not have any associated workspaces, then the free tier is returned successfully', async () => {
        const mockedUser = getUser();
        const mockedUserToken = getValidAuthToken(mockedUser.uuid, {
          owners: [],
        });
        const mockedFreeTier = newTier({
          id: 'free',
          label: 'free',
          productId: 'free',
        });

        jest.spyOn(TiersService.prototype, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);

        const response = await app.inject({
          path: `/products/tier?subscriptionType=business`,
          method: 'GET',
          headers: { Authorization: `Bearer ${mockedUserToken}` },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual(mockedFreeTier);
      });

      it('When the user has associated workspaces, then the highest tier is returned successfully', async () => {
        const mockedUser = getUser();
        const mockedUserToken = getValidAuthToken(mockedUser.uuid, {
          owners: [mockedUser.uuid],
        });
        const mockedTier = newTier();
        mockedTier.featuresPerService.drive.workspaces.enabled = true;

        jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

        const response = await app.inject({
          path: `/products/tier?subscriptionType=business`,
          method: 'GET',
          headers: { Authorization: `Bearer ${mockedUserToken}` },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual(mockedTier);
      });
    });
  });
});
