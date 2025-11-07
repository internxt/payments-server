import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUser, getValidAuthToken, newTier } from '../fixtures';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { TiersService } from '../../../src/services/tiers.service';
import { ProductsService } from '../../../src/services/products.service';
import { Service } from '../../../src/core/users/Tier';
import Logger from '../../../src/Logger';
import CacheService from '../../../src/services/cache.service';
import { UserFeaturesOverridesService } from '../../../src/services/userFeaturesOverride.service';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Testing products endpoints', () => {
  describe('Fetching products available for user', () => {
    test('When the user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedTier = newTier({
        id: 'free',
        label: 'free',
        productId: 'free',
        featuresPerService: {
          antivirus: {
            enabled: false,
          },
          backups: {
            enabled: false,
          },
        } as any,
      });
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(ProductsService.prototype, 'getApplicableTierForUser').mockResolvedValueOnce(mockedTier);

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

    test('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(ProductsService.prototype, 'getApplicableTierForUser').mockRejectedValueOnce(unexpectedError);
      const loggerErrorSpy = jest.spyOn(Logger, 'error');

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(500);
      expect(responseBody).toStrictEqual({
        message: 'Internal Server Error',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `[PRODUCTS/GET]: Error ${unexpectedError.message} for user ${mockedUser.uuid}`,
      );
    });

    test('When the user has a tier, then the tier products are returned', async () => {
      const mockedUser = getUser();
      const mockedTier = newTier();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(ProductsService.prototype, 'getApplicableTierForUser').mockResolvedValueOnce(mockedTier);
      const mockedApiResponse = {
        featuresPerService: {
          antivirus: mockedTier.featuresPerService[Service.Antivirus].enabled,
          backups: mockedTier.featuresPerService[Service.Backups].enabled,
        },
      };

      const response = await app.inject({
        path: `/products`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedApiResponse);
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

    test('When the user has a cached tier, then the cached tier is returned', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const mockedTier = newTier();

      const cachedTierSPy = jest.spyOn(CacheService.prototype, 'getUserTier').mockResolvedValue(mockedTier);
      const getTierUserSpy = jest.spyOn(ProductsService.prototype, 'getApplicableTierForUser');

      const response = await app.inject({
        path: `/products/tier`,
        method: 'GET',
        headers: { Authorization: `Bearer ${mockedUserToken}` },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedTier);
      expect(cachedTierSPy).toHaveBeenCalledWith(mockedUser.uuid);
      expect(getTierUserSpy).not.toHaveBeenCalled();
    });
  });

  describe('Activate a product', () => {
    test('When the user is not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const feature = Service.Antivirus;

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(new UserNotFoundError());

      const response = await app.inject({
        path: `/products/activate`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
        payload: {
          feature,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    test('When the feature is successfully activated, then it is processed correctly', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const feature = Service.Backups;

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      const upsertSpy = jest
        .spyOn(UserFeaturesOverridesService.prototype, 'upsertCustomUserFeatures')
        .mockResolvedValue();

      const response = await app.inject({
        path: `/products/activate`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
        body: {
          feature,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(upsertSpy).toHaveBeenCalledWith(mockedUser.id, feature);
    });

    test('When activating antivirus feature, then it is processed correctly', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const feature = Service.Antivirus;

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      const upsertSpy = jest
        .spyOn(UserFeaturesOverridesService.prototype, 'upsertCustomUserFeatures')
        .mockResolvedValue();

      const response = await app.inject({
        path: `/products/activate`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
        payload: {
          feature,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(upsertSpy).toHaveBeenCalledWith(mockedUser.id, feature);
    });

    test('When the request body is missing the feature field, then a validation error is returned', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);

      const response = await app.inject({
        path: `/products/activate`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
        body: {},
      });

      expect(response.statusCode).toBe(400);
    });

    test('When the feature value is invalid, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);

      const response = await app.inject({
        path: `/products/activate`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
        body: {
          feature: 'invalid-feature',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
