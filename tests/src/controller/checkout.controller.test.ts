import { FastifyInstance } from 'fastify';
import { getCustomer, getUser, getValidAuthToken, getValidUserToken } from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Checkout controller', () => {
  it('When the jwt verify fails, then an error indicating so is thrown', async () => {
    const mockedUser = getUser();
    const userAuthToken = 'invalid_token';

    const response = await app.inject({
      path: '/checkout/customer',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userAuthToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  describe('Get customer ID', () => {
    it('When the user exists in Users collection, then the customer Id associated to the user is returned', async () => {
      const mockedUser = getUser();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken(mockedUser.customerId);

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userAuthToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        customerId: mockedUser.customerId,
        token: userToken,
      });
    });

    it('When the user does not exists in Users collection, then the customer is created and the customer Id is returned', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken(mockedCustomer.id);

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(UserNotFoundError);
      jest.spyOn(PaymentService.prototype, 'createCustomer').mockResolvedValue(mockedCustomer);

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userAuthToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        customerId: mockedCustomer.id,
        token: userToken,
      });
    });
  });
});
