import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUser, getValidGatewayToken } from '../fixtures';
import { UsersService } from '../../../src/services/users.service';
import { UserFeaturesOverridesService } from '../../../src/services/userFeaturesOverride.service';
import CacheService from '../../../src/services/cache.service';
import { UserNotFoundError } from '../../../src/errors/PaymentErrors';
import { LicenseCodeAlreadyAppliedError, LicenseCodesService } from '../../../src/services/licenseCodes.service';
import { InvalidLicenseCodeError } from '../../../src/errors/LicenseCodeErrors';

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
      expect(upsertCustomerUserFeatures).toHaveBeenCalledWith(mockedUser, feature, undefined);
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

  describe('Checking if a given license code has been redeemed', () => {
    test('When the license code is redeemed, then it should indicates that it is not available', async () => {
      const licenseCodeRedeemedError = new LicenseCodeAlreadyAppliedError();
      const mockedGatewayToken = getValidGatewayToken();
      const code = 'test-code';
      const provider = 'EXAMPLE';

      const userSpy = jest
        .spyOn(LicenseCodesService.prototype, 'isLicenseCodeAvailable')
        .mockRejectedValue(licenseCodeRedeemedError);

      const response = await app.inject({
        path: `/gateway/is-unique-code-available`,
        method: 'GET',
        query: {
          code,
          provider,
        },
        headers: {
          Authorization: `Bearer ${mockedGatewayToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({ available: false });
      expect(responseBody.available).toBeFalsy();
      expect(userSpy).toHaveBeenCalledWith(code, provider);
    });

    test('When the license code is not redeemed, then it should indicates that it is available', async () => {
      const mockedGatewayToken = getValidGatewayToken();
      const code = 'test-code';
      const provider = 'EXAMPLE';

      const userSpy = jest.spyOn(LicenseCodesService.prototype, 'isLicenseCodeAvailable').mockResolvedValue(true);

      const response = await app.inject({
        path: `/gateway/is-unique-code-available`,
        method: 'GET',
        query: {
          code,
          provider,
        },
        headers: {
          Authorization: `Bearer ${mockedGatewayToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({ available: true });
      expect(responseBody.available).toBeTruthy();
      expect(userSpy).toHaveBeenCalledWith(code, provider);
    });

    test('When the license code does not exist, then an error indicating so is thrown', async () => {
      const notFoundError = new InvalidLicenseCodeError();
      const mockedGatewayToken = getValidGatewayToken();
      const code = 'test-code';
      const provider = 'EXAMPLE';

      jest.spyOn(LicenseCodesService.prototype, 'isLicenseCodeAvailable').mockRejectedValue(notFoundError);

      const response = await app.inject({
        path: `/gateway/is-unique-code-available`,
        method: 'GET',
        query: {
          code,
          provider,
        },
        headers: {
          Authorization: `Bearer ${mockedGatewayToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Reactivating a license cod3', () => {
    test('When the license code is reactivated, then it should be done successfully', async () => {
      const mockedGatewayToken = getValidGatewayToken();
      const code = 'test-code';

      jest.spyOn(LicenseCodesService.prototype, 'reactivateLicenseCode').mockResolvedValue();

      const response = await app.inject({
        path: `/gateway/reactivate-license-code`,
        method: 'POST',
        body: {
          code,
        },
        headers: {
          Authorization: `Bearer ${mockedGatewayToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
