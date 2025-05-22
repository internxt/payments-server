import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  getCustomer,
  getPrice,
  getPrices,
  getUniqueCodes,
  getUser,
  getValidAuthToken,
  newTier,
  voidPromise,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getUserStorage } from '../../../src/services/storage.service';
import { PaymentService } from '../../../src/services/payment.service';
import config from '../../../src/config';
import { HUNDRED_TB } from '../../../src/constants';
import { assertUser } from '../../../src/utils/assertUser';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import CacheService from '../../../src/services/cache.service';

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
    // describe('Creating a subscription', () => {
    //   it('When the promotion code is not present, then the subscription should be created without discount/coupon', async () => {
    //     const mockedUser = getUser();
    //     const mockedAuthToken = `Bearer ${getValidAuthToken(mockedUser.uuid)}`;
    //     const token = getValidUserToken(mockedUser.customerId);

    //     const mockedBody = {
    //       customerId: mockedUser.customerId,
    //       priceId: 'mocked_price_id',
    //       token,
    //     };
    //     const createSubscriptionSpy = jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue({
    //       type: 'payment',
    //       clientSecret: 'client_secret',
    //     });

    //     const response = await app.inject({
    //       method: 'POST',
    //       path: '/object-storage/subscription',
    //       body: mockedBody,
    //       headers: {
    //         authorization: mockedAuthToken,
    //       },
    //     });

    //     expect(response.statusCode).toBe(200);
    //     expect(createSubscriptionSpy).toHaveBeenCalledWith({
    //       customerId: mockedBody.customerId,
    //       priceId: mockedBody.priceId,
    //       promoCodeId: undefined,
    //     });
    //   });

    //   it('When promotion code is present, then the subscription should be created with it', async () => {
    //     const mockedUser = getUser();
    //     const mockedAuthToken = `Bearer ${getValidAuthToken(mockedUser.uuid)}`;
    //     const mockedPromoCodeId = getPromotionCodeResponse();
    //     const token = getValidUserToken(mockedUser.customerId);

    //     const mockedBody = {
    //       customerId: mockedUser.customerId,
    //       priceId: 'mocked_price_id',
    //       token,
    //       promoCodeId: mockedPromoCodeId.codeId,
    //     };
    //     const createSubscriptionSpy = jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue({
    //       type: 'payment',
    //       clientSecret: 'client_secret',
    //     });

    //     const response = await app.inject({
    //       method: 'POST',
    //       path: '/object-storage/subscription',
    //       body: mockedBody,
    //       headers: {
    //         authorization: mockedAuthToken,
    //       },
    //     });

    //     expect(response.statusCode).toBe(200);
    //     expect(createSubscriptionSpy).toHaveBeenCalledWith({
    //       customerId: mockedBody.customerId,
    //       priceId: mockedBody.priceId,
    //       promoCodeId: mockedBody.promoCodeId,
    //     });
    //   });
    // });

    describe('Create customer', () => {
      it('When the user exists, the existing customer is updated and its ID is returned with the user token', async () => {
        const mockCustomer = getCustomer();
        const getCustomerIdSpy = jest
          .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
          .mockResolvedValue(mockCustomer);
        const updatedCustomerSpy = jest
          .spyOn(PaymentService.prototype, 'updateCustomer')
          .mockImplementation(voidPromise);

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
        expect(updatedCustomerSpy).toHaveBeenCalledWith(
          mockCustomer.id,
          {
            customer: {
              name: mockCustomer.name,
            },
          },
          {
            address: {
              postal_code: mockCustomer.address?.postal_code,
              country: mockCustomer.address?.country,
            },
          },
        );
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
        jest.spyOn(PaymentService.prototype, 'getCustomerIdByEmail').mockRejectedValue(null);
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
        const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };

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

        expect(decodedToken.customerId).toBe(mockedCustomer.id);
      });

      it('When the country and the tax Id are provided, then the tax Id is attached to the customer', async () => {
        const mockedCustomer = getCustomer();
        const companyVatId = 'ES123456789';
        jest.spyOn(PaymentService.prototype, 'getCustomerIdByEmail').mockRejectedValue(null);
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
  });
});
