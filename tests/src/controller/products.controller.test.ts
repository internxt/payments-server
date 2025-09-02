import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getActiveSubscriptions, getUser, getValidAuthToken, newTier } from '../fixtures';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { TiersService } from '../../../src/services/tiers.service';
import { PaymentService } from '../../../src/services/payment.service';
import { ProductsService } from '../../../src/services/products.service';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Testing products endpoints', () => {
  describe('Fetching products available for user', () => {
    test('When the user is not found, then an error indicating so is thrown', async () => {
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

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        featuresPerService: {
          antivirus: false,
          backups: false,
        },
      });
    });

    test('When the user exists but does not have an active subscription or lifetime, then an object with all set to false is returned', async () => {
      const mockedUser = getUser({
        lifetime: false,
      });
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const mockedTier = newTier({
        featuresPerService: {
          antivirus: {
            enabled: false,
          },
          backups: {
            enabled: false,
          },
        } as any,
      });

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(ProductsService.prototype, 'getApplicableTierForUser').mockResolvedValueOnce(mockedTier);
      const getUserSubscriptionsSpy = jest
        .spyOn(PaymentService.prototype, 'getActiveSubscriptions')
        .mockResolvedValue([]);

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        featuresPerService: {
          antivirus: false,
          backups: false,
        },
      });
      expect(getUserSubscriptionsSpy).toHaveBeenCalledWith(mockedUser.customerId);
    });

    test('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(mockedUser);

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(500);
      expect(responseBody).toStrictEqual({ error: 'Internal server error' });
    });

    test('When the user is found and has a valid subscription, then the user is able to use the products', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const mockedTier = newTier();
      const mockedActiveSubscription = getActiveSubscriptions(1, [
        {
          status: 'active',
        },
      ]);
      const expectedTier = {
        featuresPerService: {
          antivirus: mockedTier.featuresPerService['antivirus'].enabled,
          backups: true,
        },
      };
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(PaymentService.prototype, 'getActiveSubscriptions').mockResolvedValue(mockedActiveSubscription);
      const getProductsTierSpy = jest
        .spyOn(ProductsService.prototype, 'getApplicableTierForUser')
        .mockResolvedValueOnce(mockedTier);

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(expectedTier);
      expect(getProductsTierSpy).toHaveBeenCalledWith({ userUuid: mockedUser.uuid, ownersId: [] });
    });
  });

  describe('Fetching tier for user', () => {
    test('When an unexpected error occurs, then an error indicating so is thrown', async () => {
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

    test('When the user has no tiers, then the free tier is returned successfully', async () => {
      const mockedUser = getUser();
      const mockedFreeTier = newTier({
        id: 'free',
        label: 'free',
        productId: 'free',
      });
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockResolvedValue([]);
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

    test('When the user has a valid subscription, then the best tier is returned successfully', async () => {
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

    test('When the user has workspace access, then the business tier is returned successfully', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid, {
        owners: [mockedUser.uuid],
      });
      const mockedTier = newTier();
      mockedTier.featuresPerService.drive.workspaces.enabled = true;

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
});
