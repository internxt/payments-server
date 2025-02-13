import { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';
import axios from 'axios';

import { default as start } from '../../src/server';

import getMocks from './mocks';
import { preloadData } from './utils/preloadMongoDBData';
import { UserNotFoundError, UsersService } from '../../src/services/users.service';
import { Bit2MeService } from '../../src/services/bit2me.service';
import { ProductsRepository } from '../../src/core/users/ProductsRepository';
import { UsersCouponsRepository } from '../../src/core/coupons/UsersCouponsRepository';
import { CouponsRepository } from '../../src/core/coupons/CouponsRepository';
import { DisplayBillingRepository } from '../../src/core/users/MongoDBDisplayBillingRepository';
import { UsersRepository } from '../../src/core/users/UsersRepository';
import { StorageService } from '../../src/services/storage.service';
import { InvalidTaxIdError, PaymentService } from '../../src/services/payment.service';
import testFactory from './utils/factory';
import config from '../../src/config';
import { User } from '../../src/core/users/User';

const mocks = getMocks();

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: FastifyInstance;

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;

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
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  storageService = new StorageService(config, axios);
  productsRepository = testFactory.getProductsRepositoryForTest();
  bit2MeService = new Bit2MeService(config, axios);
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    bit2MeService,
  );

  usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
  await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Payment controller e2e tests', () => {
  describe('Check if the unique code provided by the user is valid', () => {
    it('When the code is already used, then it returns 404 status code', async () => {
      const { uniqueCode } = mocks;
      const response = await app.inject({
        path: '/is-unique-code-available',
        query: { code: uniqueCode.techCult.codes.nonElegible, provider: uniqueCode.techCult.provider },
        method: 'GET',
      });
      expect(response.statusCode).toBe(404);
    });

    // eslint-disable-next-line quotes
    it("When the code doesn't exist, then it returns 404 status code", async () => {
      const { uniqueCode } = mocks;

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
      it('When the subscription priceId is valid, then the endpoint returns the correct object', async () => {
        const { prices } = mocks;
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

      it('When the subscription priceId is not valid, then it returns 404 status code', async () => {
        const { prices } = mocks;

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.subscription.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('Fetch Lifetime plan object', () => {
      it('When the lifetime priceId is valid, then it returns the lifetime price object', async () => {
        const { prices } = mocks;

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

      it('When the lifetime priceId is not valid, then returns 404 status code', async () => {
        const { prices } = mocks;

        const response = await app.inject({
          path: `/plan-by-id?planId=${prices.lifetime.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('POST /create-customer', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    const { user, getValidToken } = mocks;
    const createdToken = getValidToken(user.uuid);
    const authToken = `Bearer ${createdToken}`;

    it('When the email is missing in the request body, then it returns a 400 status code', async () => {
      const response = await app.inject({
        path: `/create-customer`,
        method: 'POST',
        headers: {
          authorization: authToken,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('When the user exists by UUID, then it returns the customerId and a token', async () => {
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

    it('When findUserByUuid throws a generic error, then it returns a 500 status code', async () => {
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

    it('When findUserByUuid throws a UserNotFoundError, then it does not crash', async () => {
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

    it('When the user does not exist in our DB the customer is created successfully, then it returns a customerId and token', async () => {
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
    it('When createOrGetCustomer throws an InvalidTaxIdError, then it returns a 400 status code', async () => {
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
    it('When createOrGetCustomer throws a generic error, then it returns a 500 status code', async () => {
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
