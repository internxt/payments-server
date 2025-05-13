import { FastifyInstance } from 'fastify';
import {
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCustomer,
  getInvoice,
  getTaxes,
  getUser,
  getValidAuthToken,
  getValidUserToken,
  priceById,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import { fetchUserStorage } from '../../../src/utils/fetchUserStorage';

jest.mock('../../../src/utils/fetchUserStorage');

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Checkout controller', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
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
      const userToken = getValidUserToken(mockedUser.customerId);
      const mockedPaymentIntent = {
        clientSecret: 'client_secret',
        id: 'payment_intent_id',
      };

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      (fetchUserStorage as jest.Mock).mockResolvedValue({
        canExpand: true,
      });
      jest.spyOn(PaymentService.prototype, 'createInvoice').mockResolvedValue(mockedPaymentIntent);

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

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedPaymentIntent);
    });

    it('When the user already has the max storage allowed, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'lifetime',
      });
      const authToken = getValidAuthToken(mockedUser.uuid);
      const userToken = getValidUserToken(mockedUser.customerId);

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

        const response = await app.inject({
          path: '/checkout/payment-intent',
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
          path: '/checkout/payment-intent',
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

  describe('Get Price by its ID', () => {
    it('When the user wants to get a price by its ID, then the price is returned with its taxes', async () => {
      const mockedPrice = priceById({
        bytes: 123456789,
        interval: 'year',
      });
      const mockedTaxes = getTaxes();

      jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
      jest.spyOn(PaymentService.prototype, 'calculateTax').mockResolvedValue(mockedTaxes);

      const response = await app.inject({
        path: `/checkout/price-by-id?priceId=${mockedPrice.id}`,
        method: 'GET',
        headers: {
          'X-Real-Ip': 'user-ip',
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        ...mockedPrice,
        tax: mockedTaxes.tax_amount_exclusive,
        decimalTax: mockedTaxes.tax_amount_exclusive / 100,
        amountWithTax: mockedTaxes.amount_total,
        decimalAmountWithTax: mockedTaxes.amount_total / 100,
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
          amountOff: 1000,
          percentOff: null,
          codeId: 'promo_code_id',
        };
        const mockedTaxes = getTaxes();
        mockedTaxes.tax_amount_exclusive = mockedTaxes.tax_amount_exclusive - promoCode.amountOff;
        mockedTaxes.amount_total = mockedTaxes.amount_total - promoCode.amountOff;

        jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
        jest.spyOn(PaymentService.prototype, 'getPromoCodeByName').mockResolvedValue(promoCode);
        jest.spyOn(PaymentService.prototype, 'calculateTax').mockResolvedValue(mockedTaxes);

        const response = await app.inject({
          path: `/checkout/price-by-id?priceId=${mockedPrice.id}&promoCodeName=${promoCode.promoCodeName}`,
          method: 'GET',
          headers: {
            'X-Real-Ip': 'user-ip',
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          ...mockedPrice,
          tax: mockedTaxes.tax_amount_exclusive,
          decimalTax: mockedTaxes.tax_amount_exclusive / 100,
          amountWithTax: mockedTaxes.amount_total,
          decimalAmountWithTax: mockedTaxes.amount_total / 100,
        });
      });

      it('When the user provides a promo code with amount off, then the price is returned with the discount applied', async () => {
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
        const mockedTaxes = getTaxes();
        const percentDiscount = 100 - promoCode.percentOff;
        mockedTaxes.tax_amount_exclusive = (mockedTaxes.tax_amount_exclusive * percentDiscount) / 100;
        mockedTaxes.amount_total = (mockedTaxes.tax_amount_exclusive * percentDiscount) / 100;

        jest.spyOn(PaymentService.prototype, 'getPriceById').mockResolvedValue(mockedPrice);
        jest.spyOn(PaymentService.prototype, 'getPromoCodeByName').mockResolvedValue(promoCode);
        jest.spyOn(PaymentService.prototype, 'calculateTax').mockResolvedValue(mockedTaxes);

        const response = await app.inject({
          path: `/checkout/price-by-id?priceId=${mockedPrice.id}&promoCodeName=${promoCode.promoCodeName}`,
          method: 'GET',
          headers: {
            'X-Real-Ip': 'user-ip',
          },
        });

        const responseBody = response.json();

        expect(response.statusCode).toBe(200);
        expect(responseBody).toStrictEqual({
          ...mockedPrice,
          tax: mockedTaxes.tax_amount_exclusive,
          decimalTax: mockedTaxes.tax_amount_exclusive / 100,
          amountWithTax: mockedTaxes.amount_total,
          decimalAmountWithTax: mockedTaxes.amount_total / 100,
        });
      });
    });

    describe('Handling errors', () => {
      it('When the priceId is not present in the query, then an error indicating so is thrown', async () => {
        const response = await app.inject({
          path: '/checkout/price-by-id',
          method: 'GET',
          headers: {
            'X-Real-Ip': 'user-ip',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });
});
