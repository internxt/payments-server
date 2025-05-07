import { FastifyInstance } from 'fastify';
import {
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCustomer,
  getUser,
  getValidAuthToken,
  getValidUserToken,
} from '../fixtures';
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

    it('When the user provides country and Vat Id, then they are attached to the user correctly', async () => {
      const country = 'ES';
      const companyVatId = 'vat_id';

      const mockedUser = getUser();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken(mockedUser.customerId);

      const attachCustomerAndVatIdToCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'getVatIdAndAttachTaxIdToCustomer')
        .mockResolvedValue();
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'GET',
        query: {
          country,
          companyVatId,
        },
        headers: {
          Authorization: `Bearer ${userAuthToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(attachCustomerAndVatIdToCustomerSpy).toHaveBeenCalledTimes(1);
      expect(attachCustomerAndVatIdToCustomerSpy).toHaveBeenCalledWith(mockedUser.customerId, country, companyVatId);
      expect(responseBody).toStrictEqual({
        customerId: mockedUser.customerId,
        token: userToken,
      });
    });
  });

  describe('Creating a subscription', () => {
    it('When the user wants to create a subscription, it is created successfully', async () => {
      const mockedUser = getUser();
      const mockedSubscription = getCreatedSubscription();
      const mockedSubscriptionResponse = getCreateSubscriptionResponse();

      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken(mockedUser.customerId);

      jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue(mockedSubscriptionResponse);

      const response = await app.inject({
        path: '/checkout/subscription',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedSubscription.items.data[0].price.id,
          currency: mockedSubscription.items.data[0].price.currency,
          quantity: 1,
          token: userToken,
        },
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedSubscriptionResponse);
    });

    describe('Handling errors', () => {
      it('When the id of the price is not present in the body, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            customerId: mockedUser.customerId,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('When the id of the customer is not present in the body, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('When the user token is not present in the body, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('When the provided token is invalid or cannot be verified, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);
        const invalidUserToken = 'malformed.token.payload';

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: invalidUserToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
      });

      it('When the provided token contains a customerId that does not match the provided customerId, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);
        const userToken = getValidUserToken('invalid_customer_id');

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: userToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });
});
