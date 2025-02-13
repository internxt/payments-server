import { default as start } from '../../src/server';

import { FastifyInstance } from 'fastify';
import getMocks from './mocks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { preloadData } from './utils/preloadMongoDBData';
import { UserNotFoundError, UsersService } from '../../src/services/users.service';
import { InvalidTaxIdError, PaymentService } from '../../src/services/payment.service';
import Stripe from 'stripe';
import { User } from '../../src/core/users/User';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: FastifyInstance;

const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  mongoClient = await new MongoClient(uri).connect();
  app = await start(mongoClient);
  await preloadData(mongoClient);
};

const closeServerAndDatabase = async () => {
  try {
    if (app) {
      await app.close();
    }

    if (mongoClient) {
      await mongoClient.close();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Error during server and database shutdown:', error);
  }
};

beforeAll(async () => {
  await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Payment controller e2e tests', () => {
  describe('Check if the unique code provided by the user is valid', () => {
    it('When the code has already been used, then an error indicating so is thrown', async () => {
      const { uniqueCode } = getMocks();
      const response = await app.inject({
        path: '/is-unique-code-available',
        query: { code: uniqueCode.techCult.codes.nonElegible, provider: uniqueCode.techCult.provider },
        method: 'GET',
      });
      expect(response.statusCode).toBe(404);
    });

    it('When the code is not found, then it indicates that the code does not exist', async () => {
      const { uniqueCode } = getMocks();

      const response = await app.inject({
        path: '/is-unique-code-available',
        query: { code: uniqueCode.techCult.codes.doesntExist, provider: uniqueCode.techCult.provider },
        method: 'GET',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Fetching plan object by ID and contains the basic params', () => {
    describe('Fetch subscription plan object', () => {
      it('When the subscription plan exists, then it provides the plan details', async () => {
        const { prices } = getMocks();
        const expectedKeys = {
          selectedPlan: {
            id: expect.anything(),
            currency: expect.anything(),
            amount: expect.anything(),
            bytes: expect.anything(),
            interval: expect.anything(),
            decimalAmount: expect.anything(),
          },
          upsellPlan: {
            id: expect.anything(),
            currency: expect.anything(),
            amount: expect.anything(),
            bytes: expect.anything(),
            interval: expect.anything(),
            decimalAmount: expect.anything(),
          },
        };

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.subscription.exists}`,
          method: 'GET',
        });
        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(responseBody).toMatchObject(expectedKeys);
      });

      it('When the subscription plan does not exist, then an error indicating so is thrown', async () => {
        const { prices } = getMocks();

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.subscription.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('Fetch Lifetime plan object', () => {
      it('When the lifetime plan exists, then it provides the plan details', async () => {
        const { prices } = getMocks();

        const expectedKeys = {
          selectedPlan: {
            id: expect.anything(),
            currency: expect.anything(),
            amount: expect.anything(),
            bytes: expect.anything(),
            interval: expect.anything(),
            decimalAmount: expect.anything(),
          },
        };

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.lifetime.exists}`,
          method: 'GET',
        });

        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(responseBody).toMatchObject(expectedKeys);
      });

      it('When the lifetime plan does not exist, then an error indicating so is thrown', async () => {
        const { prices } = getMocks();

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.lifetime.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('Creating a customer', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    const { mockedUserWithLifetime: user, getValidToken } = getMocks();
    const createdToken = getValidToken(user.uuid);
    const authToken = `Bearer ${createdToken}`;

    it('When the request does not include an email, then an error indicating so is throw', async () => {
      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('When the user exists by UUID, then it returns the customer details', async () => {
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(Promise.resolve(user as unknown as User));

      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        customerId: user.customerId,
        token: expect.any(String),
      });
    });

    it('When findUserByUuid throws a generic error, then an error indicating so is thrown', async () => {
      const unknownError = new Error('Unknown error');
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(unknownError);

      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('When there is an unexpected error while searching for the user by its UUID, then an error indicating so is thrown', async () => {
      const userNotFoundError = new UserNotFoundError('User not found');
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(userNotFoundError);
      const createOrGetCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'createOrGetCustomer')
        .mockResolvedValue({ id: user.customerId } as unknown as Stripe.Customer);

      await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      expect(createOrGetCustomerSpy).toHaveBeenCalledTimes(1);
    });

    it('When the customer is not found by UUID, then a new customer is created and a the customer details are provided', async () => {
      const userNotFoundError = new UserNotFoundError('User not found');
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(userNotFoundError);
      const createOrGetCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'createOrGetCustomer')
        .mockResolvedValue({ id: user.customerId } as unknown as Stripe.Customer);

      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      expect(createOrGetCustomerSpy).toHaveBeenCalledTimes(1);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        customerId: user.customerId,
        token: expect.any(String),
      });
    });

    it('When the provided tax ID is invalid, then an error indicating so is thrown', async () => {
      const userNotFoundError = new UserNotFoundError();
      const invalidTaxIdError = new InvalidTaxIdError();
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(userNotFoundError);
      jest.spyOn(PaymentService.prototype, 'createOrGetCustomer').mockRejectedValue(invalidTaxIdError);

      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      expect(response.statusCode).toBe(400);
    });
    it('When there is an unexpected error while creating a customer, then an error indicating so is thrown', async () => {
      const userNotFoundError = new UserNotFoundError();
      const unknownError = new Error('Unknown error');
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(userNotFoundError);
      jest.spyOn(PaymentService.prototype, 'createOrGetCustomer').mockRejectedValue(unknownError);

      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: { authorization: authToken },
        payload: {
          name: 'Example User',
          email: 'example@inxt.com',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
