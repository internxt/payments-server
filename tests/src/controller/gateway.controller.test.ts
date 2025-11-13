import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUser, getValidGatewayToken } from '../fixtures';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { UserFeaturesOverridesService } from '../../../src/services/userFeaturesOverride.service';
import CacheService from '../../../src/services/cache.service';

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

describe('Gateway endpoints', () => {
  describe('Activating a feature/product', () => {
    test('When a feature is passed, then the product should be activated if it is allowed', async () => {
      const mockedUser = getUser();
      const userUuid = mockedUser.uuid;
      const mockedUserToken = getValidGatewayToken();
      const feature = 'antivirus';

      const userSpy = jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      const upsertCustomerUserFeatures = jest
        .spyOn(UserFeaturesOverridesService.prototype, 'upsertCustomUserFeatures')
        .mockResolvedValue();
      const clearUserTierSpy = jest.spyOn(CacheService.prototype, 'clearUserTier').mockResolvedValue();

      const response = await app.inject({
        path: `/gateway/activate`,
        method: 'POST',
        body: {
          userUuid,
          feature,
        },
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(userSpy).toHaveBeenCalledWith(userUuid);
      expect(upsertCustomerUserFeatures).toHaveBeenCalledWith(mockedUser, feature);
      expect(clearUserTierSpy).toHaveBeenCalledWith(userUuid);
    });

    test('When the user was not found, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const userUuid = mockedUser.uuid;
      const mockedUserToken = getValidGatewayToken();
      const feature = 'cli';
      const userNotFoundError = new UserNotFoundError();

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(userNotFoundError);

      const response = await app.inject({
        path: `/gateway/activate`,
        method: 'POST',
        body: {
          userUuid,
          feature,
        },
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
