import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  getCreateSubscriptionResponse,
  getCustomer,
  getPaymentIntent,
  getPrice,
  getPrices,
  getUniqueCodes,
  getUser,
  getValidAuthToken,
  getValidUserToken,
  newTier,
  voidPromise,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUserStorage } from '../../../src/services/storage.service';
import { CustomerNotFoundError, PaymentService } from '../../../src/services/payment.service';
import config from '../../../src/config';
import { HUNDRED_TB } from '../../../src/constants';
import { assertUser } from '../../../src/utils/assertUser';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import CacheService from '../../../src/services/cache.service';
import Stripe from 'stripe';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
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
        const responseBody = response.json();

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

        const responseBody = response.json();

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

      const responseBody = response.json();

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

  describe('Object storage tests', () => {
    describe('Create customer', () => {
      it('When the user exists, then its ID is returned with the user token', async () => {
        const mockCustomer = getCustomer();
        const getCustomerIdSpy = jest
          .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
          .mockResolvedValue(mockCustomer);

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/customer',
          query: {
            customerName: mockCustomer.name as string,
            email: mockCustomer.email as string,
            country: mockCustomer.address?.country as string,
            postalCode: mockCustomer.address?.postal_code as string,
          },
        });

        const responseBody = response.json();
        const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };

        expect(response.statusCode).toBe(200);
        expect(responseBody.customerId).toBe(mockCustomer.id);
        expect(responseBody.token).toBeDefined();
        expect(getCustomerIdSpy).toHaveBeenCalledWith(mockCustomer.email);
        expect(decodedToken.customerId).toBe(mockCustomer.id);
      });

      it('When the email is missing, then an error indicating so is thrown', async () => {
        const mockedCustomer = getCustomer();

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/customer',
          query: {
            customerName: mockedCustomer.name as string,
            country: mockedCustomer.address?.country as string,
            postalCode: mockedCustomer.address?.postal_code as string,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('When the user does not exists, then a new one is created and the customer Id and token are provided', async () => {
        const mockedCustomer = getCustomer();
        jest
          .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
          .mockRejectedValue(new CustomerNotFoundError('Customer not found'));
        const createdCustomerSpy = jest
          .spyOn(PaymentService.prototype, 'createCustomer')
          .mockResolvedValue(mockedCustomer);

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/customer',
          query: {
            customerName: mockedCustomer.name as string,
            email: mockedCustomer.email as string,
            country: mockedCustomer.address?.country as string,
            postalCode: mockedCustomer.address?.postal_code as string,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody.customerId).toBe(mockedCustomer.id);
        expect(responseBody.token).toBeDefined();
        expect(createdCustomerSpy).toHaveBeenCalledWith({
          name: mockedCustomer.name,
          email: mockedCustomer.email,
          address: {
            postal_code: mockedCustomer.address?.postal_code,
            country: mockedCustomer.address?.country,
          },
        });

        const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };
        expect(decodedToken.customerId).toBe(mockedCustomer.id);
      });

      it('When there is an unexpected error while getting the existing user, then an error indicating so is thrown', async () => {
        const mockedCustomer = getCustomer();
        const unexpectedError = new Error('Random error');
        jest.spyOn(PaymentService.prototype, 'getCustomerIdByEmail').mockRejectedValue(unexpectedError);

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/customer',
          query: {
            customerName: mockedCustomer.name as string,
            email: mockedCustomer.email as string,
            country: mockedCustomer.address?.country as string,
            postalCode: mockedCustomer.address?.postal_code as string,
          },
        });

        expect(response.statusCode).toBe(500);
      });

      it('When the country and the tax Id are provided and is new customer, then the tax Id is attached to the customer', async () => {
        const mockedCustomer = getCustomer();
        const companyVatId = 'ES123456789';
        jest
          .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
          .mockRejectedValue(new CustomerNotFoundError('Customer not found'));
        jest.spyOn(PaymentService.prototype, 'createCustomer').mockResolvedValue(mockedCustomer);
        const attachVatIdSpy = jest
          .spyOn(PaymentService.prototype, 'getVatIdAndAttachTaxIdToCustomer')
          .mockImplementation(voidPromise);

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/customer',
          query: {
            customerName: mockedCustomer.name as string,
            email: mockedCustomer.email as string,
            country: mockedCustomer.address?.country as string,
            postalCode: mockedCustomer.address?.postal_code as string,
            companyVatId,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          customerId: mockedCustomer.id,
          token: jwt.sign({ customerId: mockedCustomer.id }, config.JWT_SECRET),
        });
        expect(attachVatIdSpy).toHaveBeenCalled();
        expect(attachVatIdSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedCustomer.address?.country, companyVatId);
      });
    });

    describe('Create subscription', () => {
      it('When the user wants to create a sub for object storage, then the subscription is created successfully with the additional taxes', async () => {
        const mockedUser = getUser();
        const token = getValidUserToken(mockedUser.customerId);
        const subResponse = getCreateSubscriptionResponse();

        const createSubscriptionSpy = jest
          .spyOn(PaymentService.prototype, 'createSubscription')
          .mockResolvedValue(subResponse);

        const body = {
          customerId: mockedUser.customerId,
          priceId: 'price_id',
          token,
        };

        const response = await app.inject({
          method: 'POST',
          path: '/object-storage/subscription',
          body,
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual(subResponse);
        expect(createSubscriptionSpy).toHaveBeenCalledWith({
          customerId: mockedUser.customerId,
          priceId: 'price_id',
          additionalOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });
      });

      it('When the user wants to create a subscription with promotional code, then the promotional code is applied', async () => {
        const mockedUser = getUser();
        const token = getValidUserToken(mockedUser.customerId);
        const promoCodeName = 'obj-sotrage-promo-code-name';
        const subResponse = getCreateSubscriptionResponse();

        const createSubscriptionSpy = jest
          .spyOn(PaymentService.prototype, 'createSubscription')
          .mockResolvedValue(subResponse);

        const body = {
          customerId: mockedUser.customerId,
          priceId: 'price_id',
          token,
          promoCodeId: promoCodeName,
        };

        const response = await app.inject({
          method: 'POST',
          path: '/object-storage/subscription',
          body,
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(createSubscriptionSpy).toHaveBeenCalledWith({
          customerId: mockedUser.customerId,
          priceId: 'price_id',
          promoCodeId: promoCodeName,
          additionalOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });
        expect(responseBody).toStrictEqual(subResponse);
      });

      it('When the user token is not provided, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const subResponse = getCreateSubscriptionResponse();

        jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue(subResponse);

        const body = {
          customerId: mockedUser.customerId,
          priceId: 'price_id',
        };

        const response = await app.inject({
          method: 'POST',
          path: '/object-storage/subscription',
          body,
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Payment method verification', () => {
    describe('The payment intent is created correctly', () => {
      it('When the payment intent is created and verified, then there is no client secret returned', async () => {
        const paymentMethod = 'pm_123';
        const mockedUser = getUser();
        const mockedPaymentIntent = getPaymentIntent({
          status: 'requires_capture',
        });
        const token = jwt.sign(
          {
            customerId: mockedUser.customerId,
          },
          config.JWT_SECRET,
        );
        const paymentIntentSpy = jest
          .spyOn(PaymentService.prototype, 'paymentIntent')
          .mockResolvedValue(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>);

        const response = await app.inject({
          method: 'POST',
          path: '/payment-method-verification',
          body: {
            customerId: mockedUser.customerId,
            token,
            paymentMethod,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          intentId: mockedPaymentIntent.id,
          verified: true,
        });
        expect(paymentIntentSpy).toHaveBeenCalledWith(mockedUser.customerId, 'eur', 100, {
          metadata: {
            type: 'object-storage',
          },
          description: 'Card verification charge',
          capture_method: 'manual',
          setup_future_usage: 'off_session',
          payment_method_types: ['card', 'paypal'],
          payment_method: paymentMethod,
        });
      });

      it('When the payment intent needs an additional step (such as 3D secure), then the client secret is returned to allow the user finish the process', async () => {
        const paymentMethod = 'pm_123';
        const mockedUser = getUser();
        const mockedPaymentIntent = getPaymentIntent();
        const token = jwt.sign(
          {
            customerId: mockedUser.customerId,
          },
          config.JWT_SECRET,
        );
        const paymentIntentSpy = jest
          .spyOn(PaymentService.prototype, 'paymentIntent')
          .mockResolvedValue(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>);

        const response = await app.inject({
          method: 'POST',
          path: '/payment-method-verification',
          body: {
            customerId: mockedUser.customerId,
            token,
            paymentMethod,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          intentId: mockedPaymentIntent.id,
          verified: false,
          clientSecret: mockedPaymentIntent.client_secret,
        });
        expect(paymentIntentSpy).toHaveBeenCalledWith(mockedUser.customerId, 'eur', 100, {
          metadata: {
            type: 'object-storage',
          },
          description: 'Card verification charge',
          capture_method: 'manual',
          setup_future_usage: 'off_session',
          payment_method_types: ['card', 'paypal'],
          payment_method: paymentMethod,
        });
      });
    });

    it('When the customer ID from the user token does not match with the real user customer ID, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const token = jwt.sign(
        {
          customerId: 'cus_123',
        },
        config.JWT_SECRET,
      );

      const response = await app.inject({
        method: 'POST',
        path: '/payment-method-verification',
        body: {
          customerId: mockedUser.customerId,
          token,
          paymentMethod: 'pm_123',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
