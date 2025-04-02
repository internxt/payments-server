import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUser, getValidAuthToken } from '../fixtures';
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

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        antivirus: false,
        backups: false,
      });
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

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        antivirus: false,
        backups: false,
      });
      expect(getProductsTierSpy).toHaveBeenCalledWith(mockedUser.customerId, mockedUser.lifetime);
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(mockedUser);
      jest.spyOn(TiersService.prototype, 'getProductsTier').mockRejectedValue(new Error('Unexpected error'));
      const errorSpy = jest.spyOn(app.log, 'error').mockImplementation(() => {});
      const logCalledWithUuid = errorSpy.mock.calls.some(([message]) => message.includes(mockedUser.uuid));

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
      expect(logCalledWithUuid).toBe(true);

      errorSpy.mockRestore();
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
});
