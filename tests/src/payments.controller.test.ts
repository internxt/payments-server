import { default as start } from '../../src/server';

import { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { preloadData } from './utils/preloadMongoDBData';
import { getPrice, getPrices, getUniqueCodes, getUser, getValidToken } from './fixtures';
import { PaymentService } from '../../src/services/payment.service';
import { canUserStackStorage } from '../../src/services/storage.service';
import jwt from 'jsonwebtoken';
import config from '../../src/config';

jest.mock('../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../src/services/storage.service');

  return {
    ...actualModule,
    canUserStackStorage: jest.fn().mockImplementation(),
  };
});

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
    it('When the code is already used, then it returns 404 status code', async () => {
      const mockedUniqueCode = getUniqueCodes();

      const response = await app.inject({
        path: '/is-unique-code-available',
        query: { code: mockedUniqueCode.techCult.codes.nonElegible, provider: mockedUniqueCode.techCult.provider },
        method: 'GET',
      });
      expect(response.statusCode).toBe(404);
    });

    // eslint-disable-next-line quotes
    it("When the code doesn't exist, then it returns 404 status code", async () => {
      const mockedUniqueCode = getUniqueCodes();

      const response = await app.inject({
        path: '/is-unique-code-available',
        query: { code: mockedUniqueCode.techCult.codes.doesntExist, provider: mockedUniqueCode.techCult.provider },
        method: 'GET',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Fetching plan object by ID and contains the basic params', () => {
    describe('Fetch subscription plan object', () => {
      it('When the subscription priceId is valid, then the endpoint returns the correct object', async () => {
        const mockedPrice = getPrices();
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
          path: `/plan-by-id?planId=${mockedPrice.subscription.exists}`,
          method: 'GET',
        });
        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(responseBody).toMatchObject(expectedKeys);
      });

      it('When the subscription priceId is not valid, then it returns 404 status code', async () => {
        const mockedPrice = getPrices();

        const response = await app.inject({
          path: `/plan-by-id?planId=${mockedPrice.subscription.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('Fetch Lifetime plan object', () => {
      it('When the lifetime priceId is valid, then it returns the lifetime price object', async () => {
        const mockedPrice = getPrices();

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
          path: `/plan-by-id?planId=${mockedPrice.lifetime.exists}`,
          method: 'GET',
        });

        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(responseBody).toMatchObject(expectedKeys);
      });

      it('When the lifetime priceId is not valid, then returns 404 status code', async () => {
        const mockedPrice = getPrices();

        const response = await app.inject({
          path: `/plan-by-id?planId=${mockedPrice.lifetime.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('Create a payment intent for one time payment products (lifetimes)', () => {
    it('When the user attempts to purchase a lifetime plan and is a free user, then the user should be allowed to purchase the product', async () => {
      const mockedUser = getUser();
      const mockedPrice = getPrice();
      const mockedToken = getValidToken(mockedUser.uuid);
      const paymentIntentResponse = {
        clientSecret: 'client-secret',
        id: 'client-secret-id',
      };

      jest.spyOn(PaymentService.prototype, 'getPlanById').mockResolvedValue({
        selectedPlan: {
          amount: Number(mockedPrice.unit_amount),
          bytes: 10,
          currency: mockedPrice.currency,
          decimalAmount: Number(mockedPrice.unit_amount_decimal),
          id: mockedPrice.id,
          interval: 'lifetime',
        },
      });
      (canUserStackStorage as jest.Mock).mockResolvedValue(Promise.resolve({ canExpand: true }));
      jest.spyOn(PaymentService.prototype, 'createPaymentIntent').mockResolvedValue(paymentIntentResponse);

      const token = jwt.sign(
        {
          customerId: mockedUser.customerId,
        },
        config.JWT_SECRET,
      );

      const mockedQuery = {
        customerId: mockedUser.customerId,
        planId: mockedPrice.id,
        amount: mockedPrice.unit_amount !== null ? String(mockedPrice.unit_amount) : '',
        token: token,
        currency: mockedPrice.currency,
      };

      const response = await app.inject({
        method: 'GET',
        path: '/payment-intent',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
        query: mockedQuery,
      });

      const responseBody = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(paymentIntentResponse);
    });

    it('When the user is close to the storage limit (100TB) and the product to purchase passes it, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedPrice = getPrice();
      const mockedToken = getValidToken(mockedUser.uuid);
      const paymentIntentResponse = {
        clientSecret: 'client-secret',
        id: 'client-secret-id',
      };

      jest.spyOn(PaymentService.prototype, 'getPlanById').mockResolvedValue({
        selectedPlan: {
          amount: Number(mockedPrice.unit_amount),
          bytes: 10,
          currency: mockedPrice.currency,
          decimalAmount: Number(mockedPrice.unit_amount_decimal),
          id: mockedPrice.id,
          interval: 'lifetime',
        },
      });
      (canUserStackStorage as jest.Mock).mockResolvedValue(Promise.resolve({ canExpand: false }));
      jest.spyOn(PaymentService.prototype, 'createPaymentIntent').mockResolvedValue(paymentIntentResponse);

      const token = jwt.sign(
        {
          customerId: mockedUser.customerId,
        },
        config.JWT_SECRET,
      );

      const mockedQuery = {
        customerId: mockedUser.customerId,
        planId: mockedPrice.id,
        amount: mockedPrice.unit_amount !== null ? String(mockedPrice.unit_amount) : '',
        token: token,
        currency: mockedPrice.currency,
      };

      const response = await app.inject({
        method: 'GET',
        path: '/payment-intent',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
        query: mockedQuery,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
