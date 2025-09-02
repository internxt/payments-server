import { FastifyInstance } from 'fastify';
import {
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCryptoCurrency,
  getCustomer,
  getInvoice,
  getRawCryptoInvoiceResponse,
  getTaxes,
  getUser,
  getValidAuthToken,
  getValidUserToken,
  mockCalculateTaxFor,
  priceById,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { PaymentIntent, PaymentService } from '../../../src/services/payment.service';
import { fetchUserStorage } from '../../../src/utils/fetchUserStorage';
import Stripe from 'stripe';
import { AllowedCryptoCurrencies } from '../../../src/utils/currency';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import * as verifyRecaptcha from '../../../src/utils/verifyRecaptcha';

jest.mock('../../../src/utils/fetchUserStorage');

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
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
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(PaymentService.prototype, 'updateCustomer').mockResolvedValue();

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

    test('When the user does not exists in Users collection, then the customer is created, added in our DB and the customer Id is returned', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
        address: {
          country: 'ES',
          postal_code: '08001',
          city: 'Barcelona',
          line1: 'Carrer de la Pau',
          line2: '08001',
          state: 'Catalonia',
        },
      });
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedCustomer.id });
      const insertUserPayload = {
        customerId: mockedCustomer.id,
        uuid: mockedUser.uuid,
        lifetime: false,
      };

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockRejectedValue(UserNotFoundError);
      jest.spyOn(PaymentService.prototype, 'createCustomer').mockResolvedValue(mockedCustomer);
      const insertUserSpy = jest.spyOn(UsersService.prototype, 'insertUser').mockResolvedValue();

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'GET',
        query: {
          country: 'ES',
          postalCode: '08001',
        },
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
      expect(insertUserSpy).toHaveBeenCalledWith(insertUserPayload);
    });

    it('When the user provides country and Vat Id, then they are attached to the user correctly', async () => {
      const country = 'ES';
      const companyVatId = 'vat_id';

      const mockedUser = getUser();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });

      const attachCustomerAndVatIdToCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'getVatIdAndAttachTaxIdToCustomer')
        .mockResolvedValue();
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(PaymentService.prototype, 'updateCustomer').mockResolvedValue();

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
      const mockedCaptchaToken = 'captcha_token';

      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });

      jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue(mockedSubscriptionResponse);
      jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

      const response = await app.inject({
        path: '/checkout/subscription',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedSubscription.items.data[0].price.id,
          currency: mockedSubscription.items.data[0].price.currency,
          quantity: 1,
          token: userToken,
          captchaToken: mockedCaptchaToken,
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
        const mockedCaptchaToken = 'captcha_token';

        jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: invalidUserToken,
            captchaToken: mockedCaptchaToken,
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
        const userToken = getValidUserToken({ customerId: 'invalid_customer_id' });
        const mockedCaptchaToken = 'captcha_token';

        jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: userToken,
            currency: 'eur',
            captchaToken: mockedCaptchaToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
      });

      test('When the provided captcha does not pass the validation, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);
        const userToken = getValidUserToken({ invoiceId: 'invalid_customer_id' });
        const mockedCaptchaToken = 'captcha_token';

        const verifyRecaptchaSpy = jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(false);

        const response = await app.inject({
          path: '/checkout/subscription',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: userToken,
            currency: 'eur',
            captchaToken: mockedCaptchaToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        expect(verifyRecaptchaSpy).toHaveBeenCalledWith(mockedCaptchaToken);
      });
    });
  });

  describe('Create an invoice and returns the payment intent', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('When the user wants to pay a one time plan, then an invoice is created and the client secret is returned', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'lifetime',
      });
      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });
      const mockedPaymentIntent: PaymentIntent = {
        id: 'payment_intent_id',
        clientSecret: 'client_secret',
        type: 'fiat',
      } as const;
      const mockedCaptchaToken = 'captcha_token';

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      (fetchUserStorage as jest.Mock).mockResolvedValue({
        canExpand: true,
      });
      jest.spyOn(PaymentService.prototype, 'createInvoice').mockResolvedValue(mockedPaymentIntent);
      jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

      const response = await app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedInvoice.lines.data[0].price?.id,
          token: userToken,
          currency: 'eur',
          captchaToken: mockedCaptchaToken,
        },
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedPaymentIntent);
    });

    test('when the user want to pay a one time plan using crypto currencies, then an invoice is created and the specific payload containing the QR Link is returned', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'lifetime',
      });
      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });
      const mockedCaptchaToken = 'captcha_token';
      const mockedPaymentIntent: PaymentIntent = {
        id: 'payment_intent_id',
        type: 'crypto',
        payload: {
          paymentRequestUri: 'payment_request_uri',
          qrUrl: 'qr_url',
          url: 'url',
          payAmount: 0.01,
          payCurrency: 'BTC',
          paymentAddress: 'payment_address',
        },
        token: getValidUserToken({ invoiceId: 'invoice_id' }),
      } as const;

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      (fetchUserStorage as jest.Mock).mockResolvedValue({
        canExpand: true,
      });
      jest.spyOn(PaymentService.prototype, 'createInvoice').mockResolvedValue(mockedPaymentIntent);
      jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

      const response = await app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedInvoice.lines.data[0].price?.id,
          token: userToken,
          currency: AllowedCryptoCurrencies['Bitcoin'],
          captchaToken: mockedCaptchaToken,
        },
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedPaymentIntent);
      expect(responseBody.payload.qrUrl).toBeDefined();
    });

    test('When the user wants to pay a subscription plan creating an invoice, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'year',
      });
      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });
      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);

      const response = await app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedPrice.id,
          token: userToken,
          currency: AllowedCryptoCurrencies['Bitcoin'],
        },
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('When the user already has the max storage allowed, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'lifetime',
      });
      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken({ customerId: mockedUser.customerId });

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      (fetchUserStorage as jest.Mock).mockResolvedValue({
        canExpand: false,
      });
      const createInvoiceSpy = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: {
          customerId: mockedUser.customerId,
          priceId: mockedInvoice.lines.data[0].price?.id,
          token: userToken,
        },
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(createInvoiceSpy).not.toHaveBeenCalled();
    });

    describe('Handling errors', () => {
      test('When the currency is not provided, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/payment-intent',
          method: 'POST',
          body: {
            customerId: mockedUser.customerId,
            priceId: 'price_id',
            token: getValidUserToken({ customerId: mockedUser.customerId }),
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      test('When the currency is invalid, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/payment-intent',
          method: 'POST',
          body: {
            customerId: mockedUser.customerId,
            priceId: 'price_id',
            token: getValidUserToken({ customerId: mockedUser.customerId }),
            currency: 'gbp',
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('When the id of the price is not present in the body, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);

        const response = await app.inject({
          path: '/checkout/payment-intent',
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
          path: '/checkout/payment-intent',
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
          path: '/checkout/payment-intent',
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
        const mockedCaptchaToken = 'captcha_token';

        jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

        const response = await app.inject({
          path: '/checkout/payment-intent',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: invalidUserToken,
            currency: 'eur',
            captchaToken: mockedCaptchaToken,
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
        const userToken = getValidUserToken({ invoiceId: 'invalid_customer_id' });
        const mockedCaptchaToken = 'captcha_token';

        jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);

        const response = await app.inject({
          path: '/checkout/payment-intent',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: userToken,
            currency: 'eur',
            captchaToken: mockedCaptchaToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
      });

      test('When the provided captcha does not pass the validation, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const authToken = getValidAuthToken(mockedUser.uuid);
        const userToken = getValidUserToken({ invoiceId: 'invalid_customer_id' });
        const mockedCaptchaToken = 'captcha_token';

        const verifyRecaptchaSpy = jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(false);

        const response = await app.inject({
          path: '/checkout/payment-intent',
          method: 'POST',
          body: {
            priceId: 'price_id',
            customerId: mockedUser.customerId,
            token: userToken,
            currency: 'eur',
            captchaToken: mockedCaptchaToken,
          },
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        expect(verifyRecaptchaSpy).toHaveBeenCalledWith(mockedCaptchaToken);
      });
    });
  });

  describe('Get Price by its ID', () => {
    it('When the user wants to get a price by its ID, then the price is returned with its taxes', async () => {
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'year',
      });
      const taxes = mockCalculateTaxFor(mockedPrice.amount);

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      jest
        .spyOn(PaymentService.prototype, 'calculateTax')
        .mockResolvedValueOnce(taxes as unknown as Stripe.Tax.Calculation);

      const response = await app.inject({
        path: `/checkout/price-by-id?priceId=${mockedPrice.id}&userAddress=123.12.12.12`,
        query: {
          priceId: mockedPrice.id,
          userAddress: '123.12.12.12',
        },
        method: 'GET',
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        price: mockedPrice,
        taxes: {
          tax: taxes.tax_amount_exclusive,
          decimalTax: taxes.tax_amount_exclusive / 100,
          amountWithTax: taxes.amount_total,
          decimalAmountWithTax: taxes.amount_total / 100,
        },
      });
    });

    describe('Handling promo codes', () => {
      it('When the user provides a promo code with amount off, then the price is returned with the discount applied', async () => {
        const mockedPrice = priceById({
          bytes: 123456789,
          interval: 'year',
        });
        const promoCode = {
          promoCodeName: 'promo_code_name',
          amountOff: 100,
          percentOff: null,
          codeId: 'promo_code_id',
        };
        const discountedAmount = mockedPrice.amount - promoCode.amountOff;
        const taxes = mockCalculateTaxFor(discountedAmount);

        jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
        jest.spyOn(PaymentService.prototype, 'getPromoCodeByName').mockResolvedValue(promoCode);
        jest
          .spyOn(PaymentService.prototype, 'calculateTax')
          .mockResolvedValueOnce(taxes as unknown as Stripe.Tax.Calculation);

        const response = await app.inject({
          path: '/checkout/price-by-id',
          query: {
            priceId: mockedPrice.id,
            promoCodeName: promoCode.promoCodeName,
            userAddress: '123.12.12.12',
          },
          method: 'GET',
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          price: mockedPrice,
          taxes: {
            tax: taxes.tax_amount_exclusive,
            decimalTax: taxes.tax_amount_exclusive / 100,
            amountWithTax: taxes.amount_total,
            decimalAmountWithTax: taxes.amount_total / 100,
          },
        });
      });

      it('When the user provides a promo code with percent off, then the price is returned with the discount applied', async () => {
        const mockedPrice = priceById({
          bytes: 123456789,
          interval: 'year',
        });
        const promoCode = {
          promoCodeName: 'promo_code_name',
          amountOff: null,
          percentOff: 20,
          codeId: 'promo_code_id',
        };
        const discount = Math.floor(mockedPrice.amount * (promoCode.percentOff / 100));
        const discountedAmount = mockedPrice.amount - discount;
        const taxes = mockCalculateTaxFor(discountedAmount);

        jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
        jest.spyOn(PaymentService.prototype, 'getPromoCodeByName').mockResolvedValue(promoCode);
        jest
          .spyOn(PaymentService.prototype, 'calculateTax')
          .mockResolvedValueOnce(taxes as unknown as Stripe.Tax.Calculation);

        const response = await app.inject({
          path: `/checkout/price-by-id`,
          query: {
            priceId: mockedPrice.id,
            promoCodeName: promoCode.promoCodeName,
            userAddress: '123.12.12.12',
          },
          method: 'GET',
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          price: mockedPrice,
          taxes: {
            tax: taxes.tax_amount_exclusive,
            decimalTax: taxes.tax_amount_exclusive / 100,
            amountWithTax: taxes.amount_total,
            decimalAmountWithTax: taxes.amount_total / 100,
          },
        });
      });
    });

    describe('Handling errors', () => {
      it('When the priceId is not present in the query, then an error indicating so is thrown', async () => {
        const response = await app.inject({
          path: '/checkout/price-by-id',
          method: 'GET',
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('User address, country and postal code are not provided', () => {
      it('When any of user location params are provided, then the price is returned with taxes to 0', async () => {
        const mockedPrice = priceById({
          bytes: 123456789,
          interval: 'year',
        });
        const mockedTaxes = getTaxes();

        jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
        jest.spyOn(PaymentService.prototype, 'calculateTax').mockResolvedValue(mockedTaxes);

        const response = await app.inject({
          path: `/checkout/price-by-id`,
          method: 'GET',
          query: {
            priceId: mockedPrice.id,
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          price: mockedPrice,
          taxes: {
            tax: 0,
            decimalTax: 0,
            amountWithTax: mockedPrice.amount,
            decimalAmountWithTax: mockedPrice.amount / 100,
          },
        });
      });
    });
  });

  describe('Get crypto currencies', () => {
    test('When the currencies are requested, then the available currencies are returned', async () => {
      const mockedCurrencies = [
        getCryptoCurrency(),
        getCryptoCurrency({
          name: AllowedCryptoCurrencies['Ethereum'],
        }),
      ];
      jest.spyOn(PaymentService.prototype, 'getCryptoCurrencies').mockResolvedValue(mockedCurrencies);

      const response = await app.inject({
        path: '/checkout/crypto/currencies',
        method: 'GET',
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedCurrencies);
    });
  });

  describe('Verify the crypto payment', () => {
    test('When the crypto payment invoice has an status of paid, then true is returned indicating the invoice has been paid', async () => {
      const mockedUser = getUser();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const mockedInvoice = getRawCryptoInvoiceResponse({
        status: 'paid',
      });
      const invoiceToken = getValidUserToken({ invoiceId: mockedInvoice.invoiceId });

      jest.spyOn(Bit2MeService.prototype, 'getInvoice').mockResolvedValue(mockedInvoice);

      const response = await app.inject({
        path: `/checkout/crypto/verify/payment`,
        method: 'POST',
        body: {
          token: invoiceToken,
        },
        headers: {
          authorization: `Bearer ${userAuthToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toBeTruthy();
    });

    test('When the crypto payment invoice has another status than paid, then false is returned indicating the invoice has not been paid', async () => {
      const mockedUser = getUser();
      const userAuthToken = getValidAuthToken(mockedUser.uuid);
      const mockedInvoice = getRawCryptoInvoiceResponse({
        status: 'pending',
      });
      const invoiceToken = getValidUserToken({ invoiceId: mockedInvoice.invoiceId });

      jest.spyOn(Bit2MeService.prototype, 'getInvoice').mockResolvedValue(mockedInvoice);

      const response = await app.inject({
        path: `/checkout/crypto/verify/payment`,
        method: 'POST',
        body: {
          token: invoiceToken,
        },
        headers: {
          authorization: `Bearer ${userAuthToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toBeFalsy();
    });
  });
});
