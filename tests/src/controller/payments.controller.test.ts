import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  getCreateSubscriptionResponse,
  getCustomer,
  getLicenseCode,
  getPaymentIntent,
  getPrices,
  getUniqueCodes,
  getUser,
  getValidAuthToken,
  getValidUserToken,
  newTier,
  voidPromise,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { PaymentService } from '../../../src/services/payment.service';
import { CustomerNotFoundError, NotFoundPlanByIdError } from '../../../src/errors/PaymentErrors';
import config from '../../../src/config';
import { assertUser } from '../../../src/utils/assertUser';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import CacheService from '../../../src/services/cache.service';
import Stripe from 'stripe';
import { LicenseCodesService } from '../../../src/services/licenseCodes.service';
import { StripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { Customer } from '../../../src/infrastructure/domain/entities/customer';

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
        jest.spyOn(PaymentService.prototype, 'getPlanById').mockResolvedValue(expectedKeys);

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
        const notFoundPlanByIdError = new NotFoundPlanByIdError('Plan not found');
        jest.spyOn(PaymentService.prototype, 'getPlanById').mockRejectedValue(notFoundPlanByIdError);

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
        jest.spyOn(PaymentService.prototype, 'getPlanById').mockResolvedValue(expectedKeys);

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
        const notFoundPlanByIdError = new NotFoundPlanByIdError('Plan not found');
        jest.spyOn(PaymentService.prototype, 'getPlanById').mockRejectedValue(notFoundPlanByIdError);

        const response = await app.inject({
          path: `/plan-by-id?planId=${mockedPrice.lifetime.doesNotExist}`,
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
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
          .spyOn(StripePaymentsAdapter.prototype, 'createCustomer')
          .mockResolvedValue(Customer.toDomain(mockedCustomer));

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
            postalCode: mockedCustomer.address?.postal_code,
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
        jest
          .spyOn(StripePaymentsAdapter.prototype, 'createCustomer')
          .mockResolvedValue(Customer.toDomain(mockedCustomer));
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
        const token = getValidUserToken({ customerId: mockedUser.customerId });
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
        const token = getValidUserToken({ customerId: mockedUser.customerId });
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
        const priceId = 'price_id';
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
            priceId,
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
            priceId,
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
        const priceId = 'price_id';
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
            priceId,
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
            priceId,
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
      const priceId = 'price_id';
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
          priceId,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Redeem license codes', () => {
    test('When the code and provider are valid, then the code is redeemed', async () => {
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode();
      const mockedToken = getValidAuthToken(
        mockedUser.uuid,
        { owners: [] },
        {
          name: 'John',
          lastname: 'Doe',
          email: 'example@inxt.com',
        },
      );
      const licenseCodesServiceSpy = jest.spyOn(LicenseCodesService.prototype, 'redeem').mockResolvedValue();

      const response = await app.inject({
        method: 'POST',
        path: '/licenses',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
        body: {
          code: mockedLicenseCode.code,
          provider: mockedLicenseCode.provider,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(licenseCodesServiceSpy).toHaveBeenCalledWith({
        user: {
          name: 'John Doe',
          email: 'example@inxt.com',
          uuid: mockedUser.uuid,
        },
        code: mockedLicenseCode.code,
        provider: mockedLicenseCode.provider,
      });
    });
  });
});
