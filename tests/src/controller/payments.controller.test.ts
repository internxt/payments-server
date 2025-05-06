import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  getCustomer,
  getPrice,
  getPrices,
  getPromotionCode,
  getUniqueCodes,
  getUser,
  getValidAuthToken,
  getValidUserToken,
  newTier,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUserStorage } from '../../../src/services/storage.service';
import { PaymentService } from '../../../src/services/payment.service';
import config from '../../../src/config';
import { HUNDRED_TB } from '../../../src/constants';
import { assertUser } from '../../../src/utils/assertUser';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import CacheService from '../../../src/services/cache.service';
import { UserAlreadyExistsError } from '../../../src/services/payment.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined), // Para cerrar la conexión correctamente
  }));
});

jest.mock('../../../src/utils/assertUser');
jest.mock('../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../src/services/storage.service');

  return {
    ...actualModule,
    getUserStorage: jest.fn().mockImplementation(),
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
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
      const mockedToken = getValidAuthToken(mockedUser.uuid);
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
      (getUserStorage as jest.Mock).mockResolvedValue(Promise.resolve({ currentMaxSpaceBytes: 1024 }));
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
      const mockedToken = getValidAuthToken(mockedUser.uuid);
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
      (getUserStorage as jest.Mock).mockResolvedValue(Promise.resolve({ currentMaxSpaceBytes: HUNDRED_TB }));
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

  describe('Get the user subscription', () => {
    describe('The user has a lifetime', () => {
      it('When the user has a Tier, then the type of subscription is lifetime and the product ID of the tier is returned', async () => {
        const mockedUser = getUser({ lifetime: true });
        const mockedToken = getValidAuthToken(mockedUser.uuid);
        const mockedTier = newTier({ billingType: 'lifetime' });
        (assertUser as jest.Mock).mockResolvedValue(mockedUser);
        jest.spyOn(CacheService.prototype, 'getSubscription').mockResolvedValue(null);
        jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

        const response = await app.inject({
          method: 'GET',
          path: '/subscriptions',
          headers: {
            authorization: `Bearer ${mockedToken}`,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          type: 'lifetime',
          productId: mockedTier.productId,
        });
      });

      it('When the user does not have a Tier, then the type of subscription is lifetime and the product Id is not returned', async () => {
        const tierNotFoundError = new TierNotFoundError('Tier not found');
        const mockedUser = getUser({ lifetime: true });
        const mockedToken = getValidAuthToken(mockedUser.uuid);

        (assertUser as jest.Mock).mockResolvedValue(mockedUser);
        jest.spyOn(CacheService.prototype, 'getSubscription').mockResolvedValue(null);
        jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);

        const response = await app.inject({
          method: 'GET',
          path: '/subscriptions',
          headers: {
            authorization: `Bearer ${mockedToken}`,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          type: 'lifetime',
        });
      });

      it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
        const unexpectedError = new Error('Unexpected Error');
        const mockedUser = getUser({ lifetime: true });
        const mockedToken = getValidAuthToken(mockedUser.uuid);

        (assertUser as jest.Mock).mockResolvedValue(mockedUser);
        jest.spyOn(CacheService.prototype, 'getSubscription').mockResolvedValue(null);
        jest.spyOn(TiersService.prototype, 'getTiersProductsByUserId').mockRejectedValue(unexpectedError);

        const response = await app.inject({
          method: 'GET',
          path: '/subscriptions',
          headers: {
            authorization: `Bearer ${mockedToken}`,
          },
        });

        expect(response.statusCode).toBe(500);
      });
    });
  });

  describe('Creating a subscription for object storage', () => {
    describe('Object storage subscription with promotion code', () => {
      it('When the promotion code is not present, then the subscription should be created without discount/coupon', async () => {
        const mockedUser = getUser();
        const mockedAuthToken = `Bearer ${getValidAuthToken(mockedUser.uuid)}`;
        const token = getValidUserToken(mockedUser.customerId);

        const mockedBody = {
          customerId: mockedUser.customerId,
          priceId: 'mocked_price_id',
          token,
        };
        const createSubscriptionSpy = jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue({
          type: 'payment',
          clientSecret: 'client_secret',
        });

        const response = await app.inject({
          method: 'POST',
          path: '/create-subscription-for-object-storage',
          body: mockedBody,
          headers: {
            authorization: mockedAuthToken,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(createSubscriptionSpy).toHaveBeenCalledWith({
          customerId: mockedBody.customerId,
          priceId: mockedBody.priceId,
          promoCodeId: undefined,
        });
      });

      it('When promotion code is present, then the subscription should be created with it', async () => {
        const mockedUser = getUser();
        const mockedAuthToken = `Bearer ${getValidAuthToken(mockedUser.uuid)}`;
        const mockedPromoCodeId = getPromotionCode();
        const token = getValidUserToken(mockedUser.customerId);

        const mockedBody = {
          customerId: mockedUser.customerId,
          priceId: 'mocked_price_id',
          token,
          promoCodeId: mockedPromoCodeId.codeId,
        };
        const createSubscriptionSpy = jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue({
          type: 'payment',
          clientSecret: 'client_secret',
        });

        const response = await app.inject({
          method: 'POST',
          path: '/create-subscription-for-object-storage',
          body: mockedBody,
          headers: {
            authorization: mockedAuthToken,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(createSubscriptionSpy).toHaveBeenCalledWith({
          customerId: mockedBody.customerId,
          priceId: mockedBody.priceId,
          promoCodeId: mockedBody.promoCodeId,
        });
      });
    });
  });

  describe('Create customer for object storage', () => {
    it('When the user provides valid data, then a customer is created and a token is returned', async () => {
      const name = 'Test User';
      const email = 'test@example.com';
      const country = 'ES';
      const customerId = 'cus_test';
      const mockCustomer = getCustomer({ id: customerId });
      const createOrGetCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'createOrGetCustomer')
        .mockResolvedValue(mockCustomer);

      const response = await app.inject({
        method: 'POST',
        path: '/create-customer-for-object-storage',
        body: { name, email, country },
      });

      const responseBody = response.json();
      expect(response.statusCode).toBe(200);
      expect(createOrGetCustomerSpy).toHaveBeenCalledWith({ name, email }, country, undefined);
      expect(responseBody.customerId).toBe(customerId);
      expect(responseBody.token).toBeDefined();

      const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };
      expect(decodedToken.customerId).toBe(customerId);
    });

    it('When the email is missing, then it returns 404 status code', async () => {
      const name = 'Test User';
      const country = 'ES';

      const response = await app.inject({
        method: 'POST',
        path: '/create-customer-for-object-storage',
        body: { name, country },
      });

      expect(response.statusCode).toBe(400);
    });

    it('When the user already exists, then it returns 409 status code', async () => {
      const name = 'Test User';
      const email = 'existing@example.com';
      const country = 'ES';
      const userExistsError = new UserAlreadyExistsError(email);
      jest.spyOn(PaymentService.prototype, 'createOrGetCustomer').mockRejectedValue(userExistsError);

      const response = await app.inject({
        method: 'POST',
        path: '/create-customer-for-object-storage',
        body: { name, email, country },
      });

      expect(response.statusCode).toBe(409);
      expect(response.body).toBe(userExistsError.message);
    });

    it('When an internal server error occurs, then it returns 500 status code', async () => {
      const name = 'Test User';
      const email = 'error@example.com';
      const country = 'ES';
      const internalError = new Error('Internal Server Error');
      jest.spyOn(PaymentService.prototype, 'createOrGetCustomer').mockRejectedValue(internalError);

      const response = await app.inject({
        method: 'POST',
        path: '/create-customer-for-object-storage',
        body: { name, email, country },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ message: 'Internal Server Error' });
    });
  });
});
