import dayjs from 'dayjs';
import { UserType } from '../../../src/core/users/User';
import {
  getCharge,
  getCoupon,
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCustomer,
  getInvoice,
  getInvoices,
  getPaymentIntent,
  getPaymentIntentResponse,
  getPaymentMethod,
  getPrice,
  getPrices,
  getProduct,
  getPromoCode,
  getPromotionCodeResponse,
  getTaxes,
  getUser,
} from '../fixtures';
import { BadRequestError, NotFoundError } from '../../../src/errors/Errors';
import { createTestServices } from '../helpers/services-factory';
import Stripe from 'stripe';
import { getStripeNewVersion } from '../../../src/services/stripe';
import { stripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import {
  getCustomerEntity,
  getInvoiceEntity,
  getInvoiceItemsEntity,
  getPriceEntity,
  getSubscriptionEntity,
} from '../entity.fixtures';
import {
  ClientSecretNotFoundError,
  PaymentMethodNotFoundError,
  SubscriptionNotEligibleForEarlyChargeError,
} from '../../../src/errors/PaymentErrors';
import { STRIPE_TAX_LOCATION_INVALID_CODE } from '../../../src/errors/stripeErrorCodes';

const stripeNewVersion = getStripeNewVersion();

describe('Payments Service tests', () => {
  const { paymentService, stripe } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Fetching the promotion code object', () => {
    it('When requesting the Promotion Code with the correct params, then returns the promoCodeId, name, amount off and/or discount off', async () => {
      const mockedPromoCode = getPromotionCodeResponse();
      const mockedPrices = getPrices();
      const mockedCoupon = getCoupon();

      const existingSubscription = mockedPrices.subscription.exists;
      const promoCode = mockedCoupon.code;

      const customerCreatedSpy = jest
        .spyOn(paymentService, 'getPromotionCodeByName')
        .mockImplementation(() => Promise.resolve(mockedPromoCode));

      const promotionCode = await paymentService.getPromotionCodeByName(existingSubscription, promoCode);

      expect(customerCreatedSpy).toHaveBeenCalledWith(existingSubscription, promoCode);
      expect(promotionCode).toEqual(mockedPromoCode);
    });
  });

  describe('Creating a subscription', () => {
    it('When trying to create a subscription with the correct params, then it is successfully created', async () => {
      const mockedSubscriptionResponse = getCreateSubscriptionResponse();
      const mockedCreateSubscription = getCreatedSubscription();

      const subscriptionCreatedSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockImplementation(() => Promise.resolve(mockedSubscriptionResponse));

      const subscription = await paymentService.createSubscription({
        customerId: mockedCreateSubscription.customer as string,
        priceId: mockedCreateSubscription.items.data[0].price.id,
        promoCodeId: (
          (mockedCreateSubscription.discounts[0] as Stripe.Discount)?.promotion_code as Stripe.PromotionCode
        ).code,
      });

      expect(subscriptionCreatedSpy).toHaveBeenCalledWith({
        customerId: mockedCreateSubscription.customer as string,
        priceId: mockedCreateSubscription.items.data[0].price.id,
        promoCodeId: (
          (mockedCreateSubscription.discounts[0] as Stripe.Discount)?.promotion_code as Stripe.PromotionCode
        ).code,
      });
      expect(subscription).toEqual(mockedSubscriptionResponse);
    });

    it('When trying to create a business subscription, then an error is thrown', async () => {
      const mockedCreateSubscription = getCreatedSubscription();
      const mockedPrice = getPrice({
        product: {
          metadata: {
            type: 'business',
          },
        } as any,
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(mockedPrice as any);

      await expect(
        paymentService.createSubscription({
          customerId: mockedCreateSubscription.customer as string,
          priceId: mockedCreateSubscription.items.data[0].price.id,
          promoCodeId: (
            (mockedCreateSubscription.discounts[0] as Stripe.Discount)?.promotion_code as Stripe.PromotionCode
          ).code,
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('Creating an invoice', () => {
    test('When trying to create an invoice with the correct params, then it is successfully created', async () => {
      const mockedPaymentIntent = getPaymentIntentResponse({ type: 'fiat' });
      const mockedInvoice = getInvoice({
        discounts: [
          {
            promotion_code: {
              code: 'mockedPromoCode',
            },
          },
        ],
      });

      const paymentIntentPayload = {
        customerId: mockedInvoice.customer as string,
        priceId: mockedInvoice.lines.data[0].price?.id as string,
        currency: mockedInvoice.lines.data[0].price?.currency as string,
        promoCodeId: ((mockedInvoice.discounts[0] as Stripe.Discount)?.promotion_code as Stripe.PromotionCode).code,
      };

      const paymentIntentSpy = jest
        .spyOn(paymentService, 'createInvoice')
        .mockImplementation(() => Promise.resolve(mockedPaymentIntent));

      const paymentIntent = await paymentService.createInvoice(paymentIntentPayload);
      expect(paymentIntentSpy).toHaveBeenCalledWith(paymentIntentPayload);
      expect(paymentIntent).toStrictEqual(mockedPaymentIntent);
    });
  });

  describe('Creating a user invoice for one time payment products', () => {
    test('When fetching the Payment Intent customer with the correct payload, then returns the client secret', async () => {
      const mockedPaymentIntent = getPaymentIntentResponse({
        type: 'fiat',
      });
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: 'mockedPriceId',
                },
              },
              currency: 'eur',
            },
          ],
        },
        payments: {
          data: [
            {
              payment: {
                payment_intent: mockedPaymentIntent.id,
              },
            },
          ],
        },
        confirmation_secret: {
          client_secret: mockedPaymentIntent.clientSecret as string,
        },
      });
      jest
        .spyOn(stripeNewVersion.invoices, 'create')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoiceItems, 'create')
        .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest
        .spyOn(stripeNewVersion.invoices, 'retrieve')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoices, 'finalizeInvoice')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripeNewVersion.paymentIntents, 'retrieve').mockResolvedValueOnce({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
        client_secret: mockedPaymentIntent.clientSecret as string,
      });

      const paymentIntent = await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: mockedInvoice.lines.data[0].pricing?.price_details?.price as string,
        currency: mockedInvoice.lines.data[0].currency as string,
      });

      expect(paymentIntent).toStrictEqual({
        clientSecret: mockedPaymentIntent.clientSecret,
        id: mockedPaymentIntent.id,
        type: 'fiat',
      });
    });

    test('When the invoice is created and marked as paid, then it returns the invoice status', async () => {
      const mockedInvoice = getInvoice({
        status: 'paid',
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: 'mockedPriceId',
                },
              },
              currency: 'eur',
            },
          ],
        },
      });

      const mockedPaymentIntent = getPaymentIntentResponse({
        clientSecret: '',
        id: '',
        invoiceStatus: 'paid',
        type: 'fiat',
      });

      jest
        .spyOn(stripeNewVersion.invoices, 'create')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoiceItems, 'create')
        .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest
        .spyOn(stripeNewVersion.invoices, 'retrieve')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoices, 'finalizeInvoice')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripeNewVersion.paymentIntents, 'retrieve').mockResolvedValueOnce({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
      });

      const paymentIntent = await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: mockedInvoice.lines.data[0].pricing?.price_details?.price as string,
        currency: mockedInvoice.lines.data[0].currency as string,
      });

      expect(paymentIntent).toEqual(mockedPaymentIntent);
    });

    test('When the buyer comes from a Google Ads click, then the click ID is saved in the invoice item metadata', async () => {
      const mockedPaymentIntent = getPaymentIntentResponse({ type: 'fiat' });
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: 'mockedPriceId',
                },
              },
              currency: 'eur',
            },
          ],
        },
        payments: {
          data: [
            {
              payment: {
                payment_intent: mockedPaymentIntent.id,
              },
            },
          ],
        },
        confirmation_secret: {
          client_secret: mockedPaymentIntent.clientSecret as string,
        },
      });

      jest
        .spyOn(stripeNewVersion.invoices, 'create')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      const invoiceItemsCreateSpy = jest
        .spyOn(stripeNewVersion.invoiceItems, 'create')
        .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValueOnce(getPriceEntity({ id: 'mockedPriceId' }));
      jest
        .spyOn(stripeNewVersion.invoices, 'retrieve')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoices, 'finalizeInvoice')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripeNewVersion.paymentIntents, 'retrieve').mockResolvedValueOnce({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
        client_secret: mockedPaymentIntent.clientSecret as string,
      });

      await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: 'mockedPriceId',
        currency: 'eur',
        gclid: 'gclid_123',
      });

      expect(invoiceItemsCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { gclid: 'gclid_123' },
        }),
      );
    });

    test('When an INR lifetime invoice exceeds the UPI cap, then UPI is removed before finalizing it', async () => {
      const mockedInvoice = getInvoice({
        total: 15000000,
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: 'mockedPriceId',
                },
              },
              currency: 'inr',
            },
          ],
        },
      });
      const mockedPaymentIntent = getPaymentIntentResponse({});
      const mockedFinalizedInvoice = getInvoice({
        payments: {
          data: [
            {
              payment: {
                payment_intent: mockedPaymentIntent.id,
              },
            },
          ],
        },
        confirmation_secret: {
          client_secret: mockedPaymentIntent.clientSecret as string,
        },
      });

      jest
        .spyOn(stripeNewVersion.invoices, 'create')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoiceItems, 'create')
        .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest
        .spyOn(stripeNewVersion.invoices, 'retrieve')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      const updateSpy = jest
        .spyOn(stripeNewVersion.invoices, 'update')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoices, 'finalizeInvoice')
        .mockResolvedValueOnce(mockedFinalizedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripeNewVersion.paymentIntents, 'retrieve').mockResolvedValueOnce({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
        client_secret: mockedPaymentIntent.clientSecret as string,
      });

      await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: 'mockedPriceId',
        currency: 'inr',
      });

      expect(updateSpy).toHaveBeenCalledWith(mockedInvoice.id, {
        payment_settings: { payment_method_types: ['card'] },
      });
    });
  });

  describe('Get User default payment method', () => {
    const mockProvider = {
      paymentMethods: {
        list: jest.fn(),
      },
      customers: {
        retrieve: jest.fn(),
      },
    };
    const mockGetActiveSubscriptions = jest.fn();

    const { id: customerId } = getUser();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('when user is lifetime individual, then returns the payment method', async () => {
      const mockedPaymentMethod = getPaymentMethod();
      const mockPaymentMethods = [{ ...mockedPaymentMethod }];
      mockProvider.paymentMethods.list.mockResolvedValue({ data: mockPaymentMethods });

      const result = await paymentService.getDefaultPaymentMethod.call(
        { provider: mockProvider, getActiveSubscriptions: mockGetActiveSubscriptions },
        customerId,
        true,
        UserType.Individual,
      );

      expect(mockProvider.paymentMethods.list).toHaveBeenCalledWith({ customer: customerId });
      expect(result).toEqual(mockPaymentMethods[0]);
    });

    it('when no payment methods exist for lifetime individual user, then returns null', async () => {
      mockProvider.paymentMethods.list.mockResolvedValue({ data: [] });

      const result = await paymentService.getDefaultPaymentMethod.call(
        { provider: mockProvider, getActiveSubscriptions: mockGetActiveSubscriptions },
        customerId,
        true,
        UserType.Individual,
      );

      expect(mockProvider.paymentMethods.list).toHaveBeenCalledWith({ customer: customerId });
      expect(result).toBeNull();
    });

    it('when subscriptions exist with default payment method, then returns the default payment method', async () => {
      const mockedSubscription = getCreatedSubscription();
      const mockSubscriptions = [
        {
          ...mockedSubscription,
        },
      ];
      mockGetActiveSubscriptions.mockResolvedValue(mockSubscriptions);

      const result = await paymentService.getDefaultPaymentMethod.call(
        { provider: mockProvider, getActiveSubscriptions: mockGetActiveSubscriptions },
        customerId,
        false,
        UserType.Individual,
      );

      expect(mockGetActiveSubscriptions).toHaveBeenCalledWith(customerId);
      expect(result).toEqual(mockSubscriptions[0].default_payment_method);
    });

    it('when no active subscriptions exist, then returns null', async () => {
      mockGetActiveSubscriptions.mockResolvedValue([]);

      const result = await paymentService.getDefaultPaymentMethod.call(
        { provider: mockProvider, getActiveSubscriptions: mockGetActiveSubscriptions },
        customerId,
        false,
        UserType.Individual,
      );

      expect(mockGetActiveSubscriptions).toHaveBeenCalledWith(customerId);
      expect(result).toBeNull();
    });

    it('when no default payment method exists in subscriptions, then returns the default source', async () => {
      const mockedSubscription = getCreatedSubscription({
        default_payment_method: undefined,
      });
      const mockSubscriptions = [
        {
          ...mockedSubscription,
        },
      ];
      mockGetActiveSubscriptions.mockResolvedValue(mockSubscriptions);

      const result = await paymentService.getDefaultPaymentMethod.call(
        { provider: mockProvider, getActiveSubscriptions: mockGetActiveSubscriptions },
        customerId,
        false,
        UserType.Individual,
      );

      expect(mockGetActiveSubscriptions).toHaveBeenCalledWith(customerId);
      expect(result).toEqual(mockSubscriptions[0].default_source);
    });
  });

  describe('Get the Drive invoices', () => {
    const { id: customerId } = getCustomer();
    const { id: subscriptionId } = getCreatedSubscription();
    const mockPagination = { limit: 10, startingAfter: 'inv_123' };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('When userType is Individual, then returns filtered invoices with individual type', async () => {
      const mockedInvoices = getInvoice(undefined, UserType.Individual);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([mockedInvoices]);

      const result = await paymentService.getDriveInvoices(customerId, mockPagination, UserType.Individual);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined, 'paid');
      expect(result).toEqual([
        {
          id: mockedInvoices.id,
          created: mockedInvoices.created,
          pdf: mockedInvoices.invoice_pdf,
          bytesInPlan: mockedInvoices.lines.data[0].price?.metadata.maxSpaceBytes,
          product: mockedInvoices.lines.data[0].price?.product,
          total: mockedInvoices.total,
          currency: mockedInvoices.currency,
        },
      ]);
    });

    it('When userType is Business, then returns filtered invoices with business type', async () => {
      const mockedInvoices = getInvoice(undefined, UserType.Business);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([mockedInvoices]);

      const result = await paymentService.getDriveInvoices(customerId, mockPagination, UserType.Business);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined, 'paid');
      expect(result).toEqual([
        {
          id: mockedInvoices.id,
          created: mockedInvoices.created,
          pdf: mockedInvoices.invoice_pdf,
          bytesInPlan: mockedInvoices.lines.data[0].price?.metadata.maxSpaceBytes,
          product: mockedInvoices.lines.data[0].price?.product,
          total: mockedInvoices.total,
          currency: mockedInvoices.currency,
        },
      ]);
    });

    it('When a subscriptionId is provided, then filters invoices by subscriptionId', async () => {
      const mockedInvoices = getInvoices();
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockedInvoices);

      const result = await paymentService.getDriveInvoices(
        customerId,
        mockPagination,
        UserType.Individual,
        subscriptionId,
      );

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(
        customerId,
        mockPagination,
        subscriptionId,
        'paid',
      );
      expect(result).toEqual(
        mockedInvoices.map((invoice) => ({
          id: invoice.id,
          created: invoice.created,
          pdf: invoice.invoice_pdf,
          bytesInPlan: invoice.lines.data[0].price?.metadata.maxSpaceBytes,
          product: invoice.lines.data[0].price?.product,
          total: invoice.total,
          currency: invoice.currency,
        })),
      );
    });

    it('When no invoices match the filters, then returns an empty array', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([]);

      const result = await paymentService.getDriveInvoices(customerId, mockPagination, UserType.Individual);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined, 'paid');
      expect(result).toEqual([]);
    });

    it('When getInvoicesFromUser throws an error, then it propagates the error', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockRejectedValue(new Error('Service error'));

      await expect(paymentService.getDriveInvoices(customerId, mockPagination, UserType.Individual)).rejects.toThrow(
        'Service error',
      );
    });
  });

  describe('Get tax for a price', () => {
    test('When the params are correct, then a tax object is returned for the requested price', async () => {
      const mockedPrice = getPrice();
      const mockedTaxes = getTaxes();
      jest
        .spyOn(stripe.tax.calculations, 'create')
        .mockResolvedValue(mockedTaxes as Stripe.Response<Stripe.Tax.Calculation>);

      const taxes = await paymentService.calculateTax(mockedPrice.id, mockedPrice.unit_amount as number, 'user_ip');

      expect(taxes).toStrictEqual(mockedTaxes);
    });

    test('When the location is not enough to determine the tax jurisdiction, then no tax is returned so the price still loads', async () => {
      const mockedPrice = getPrice();
      const insufficientLocationError = new Stripe.errors.StripeInvalidRequestError({
        message: "The IP address provided is insufficient to determine the customer's tax location.",
        type: 'invalid_request_error',
        code: STRIPE_TAX_LOCATION_INVALID_CODE,
      });
      jest.spyOn(stripe.tax.calculations, 'create').mockRejectedValue(insufficientLocationError);

      const taxes = await paymentService.calculateTax(mockedPrice.id, mockedPrice.unit_amount as number, 'user_ip');

      expect(taxes).toBeUndefined();
    });

    test('When the stored customer address is not enough to determine the tax jurisdiction, then no tax is returned so the price still loads', async () => {
      const mockedPrice = getPrice();
      const customerId = 'cus_customer_with_incomplete_address';
      const insufficientLocationError = new Stripe.errors.StripeInvalidRequestError({
        message: "The customer's address is missing or invalid for tax purposes.",
        type: 'invalid_request_error',
        code: STRIPE_TAX_LOCATION_INVALID_CODE,
      });
      jest.spyOn(stripe.tax.calculations, 'create').mockRejectedValue(insufficientLocationError);

      const taxes = await paymentService.calculateTax(
        mockedPrice.id,
        mockedPrice.unit_amount as number,
        undefined,
        'eur',
        customerId,
      );

      expect(taxes).toBeUndefined();
    });

    test('When Stripe fails for an unrelated reason, then the error is propagated', async () => {
      const mockedPrice = getPrice();
      const unexpectedError = new Stripe.errors.StripeInvalidRequestError({
        message: 'No such price.',
        type: 'invalid_request_error',
        code: 'resource_missing',
      });
      jest.spyOn(stripe.tax.calculations, 'create').mockRejectedValue(unexpectedError);

      await expect(
        paymentService.calculateTax(mockedPrice.id, mockedPrice.unit_amount as number, 'user_ip'),
      ).rejects.toThrow(unexpectedError);
    });
  });

  describe('Get Promotion Code', () => {
    describe('Get active promotion code by name', () => {
      it('When the promotion code is active, then it returns the correct promo code', async () => {
        const mockedPromoCode = getPromoCode();
        jest.spyOn(stripe.promotionCodes, 'list').mockResolvedValue({
          data: [mockedPromoCode],
          has_more: false,
          url: '',
          lastResponse: {} as any,
          object: 'list',
        });

        const promoCode = await paymentService.getPromoCode({ promoCodeName: mockedPromoCode.code });

        expect(promoCode).toStrictEqual(mockedPromoCode);
        expect(promoCode.active).toBeTruthy();
      });

      it('When the promotion code is not active, then an error indicating so is thrown', async () => {
        const mockedPromoCode = getPromoCode({
          active: false,
        });
        jest.spyOn(stripe.promotionCodes, 'list').mockResolvedValue({
          data: [mockedPromoCode],
          has_more: false,
          url: '',
          lastResponse: {} as any,
          object: 'list',
        });

        await expect(paymentService.getPromoCode({ promoCodeName: mockedPromoCode.code })).rejects.toThrow(
          NotFoundError,
        );
      });

      it('When there are no promotion codes with the given name, then an error indicating so is thrown', async () => {
        const mockedPromoCode = getPromoCode();
        jest.spyOn(stripe.promotionCodes, 'list').mockResolvedValue({
          data: [],
          has_more: false,
          url: '',
          lastResponse: {} as any,
          object: 'list',
        });

        await expect(paymentService.getPromoCode({ promoCodeName: mockedPromoCode.code })).rejects.toThrow(
          NotFoundError,
        );
      });
    });

    describe('Get promotion code object by name', () => {
      it('When the promotion code is active and the product can be applied, then it returns the correct promo code', async () => {
        const mockedPrice = getPrice();
        const mockedPromoCode = getPromoCode();
        mockedPromoCode.coupon.applies_to = { products: [mockedPrice.product as string] };
        jest.spyOn(paymentService, 'getPromoCode').mockResolvedValue(mockedPromoCode);

        const promoCodeByName = await paymentService.getPromoCodeByName(
          mockedPrice.product as string,
          mockedPromoCode.code,
        );

        expect(promoCodeByName).toStrictEqual({
          promoCodeName: mockedPromoCode.code,
          codeId: mockedPromoCode.id,
          amountOff: mockedPromoCode.coupon.amount_off,
          percentOff: mockedPromoCode.coupon.percent_off,
        });
      });

      it('When the promotion code is active and there are no products to apply, then it returns the correct promo code', async () => {
        const mockedPrice = getPrice();
        const mockedPromoCode = getPromoCode();
        jest.spyOn(paymentService, 'getPromoCode').mockResolvedValue(mockedPromoCode);

        const promoCodeByName = await paymentService.getPromoCodeByName(
          mockedPrice.product as string,
          mockedPromoCode.code,
        );

        expect(promoCodeByName).toStrictEqual({
          promoCodeName: mockedPromoCode.code,
          codeId: mockedPromoCode.id,
          amountOff: mockedPromoCode.coupon.amount_off,
          percentOff: mockedPromoCode.coupon.percent_off,
        });
      });

      it('When the promotion code is active but the product cannot be applied, then an error indicating so is thrown', async () => {
        const mockedPrice = getPrice();
        const mockedPromoCode = getPromoCode();
        jest.spyOn(paymentService, 'getPromoCode').mockResolvedValue(mockedPromoCode);

        mockedPromoCode.coupon.applies_to = { products: ['other_product'] };

        await expect(
          paymentService.getPromoCodeByName(mockedPrice.product as string, mockedPromoCode.code),
        ).rejects.toThrow(BadRequestError);
      });
    });
  });

  describe('Create payment intent', () => {
    it('When a new payment intent is requested, then the payment intent is returned', async () => {
      const mockedUser = getUser();
      const mockedPaymentIntent = getPaymentIntent();
      const paymentIntentSpy = jest
        .spyOn(stripe.paymentIntents, 'create')
        .mockResolvedValue(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>);

      const paymentIntent = await paymentService.paymentIntent(mockedUser.customerId, 'eur', 100);

      expect(paymentIntent).toStrictEqual(mockedPaymentIntent);
      expect(paymentIntentSpy).toHaveBeenCalledWith({
        customer: mockedUser.customerId,
        currency: 'eur',
        amount: 100,
      });
    });

    it('When a new payment intent is requested with additional parameters, then the additional params are applied and payment intent is returned', async () => {
      const metadata = {
        type: 'test',
      };
      const mockedUser = getUser();
      const mockedPaymentIntent = getPaymentIntent({
        metadata,
      });
      const paymentIntentSpy = jest
        .spyOn(stripe.paymentIntents, 'create')
        .mockResolvedValue(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>);

      const paymentIntent = await paymentService.paymentIntent(mockedUser.customerId, 'eur', 100, {
        metadata,
      });

      expect(paymentIntent).toStrictEqual(mockedPaymentIntent);
      expect(paymentIntentSpy).toHaveBeenCalledWith({
        customer: mockedUser.customerId,
        currency: 'eur',
        amount: 100,
        metadata,
      });
    });
  });

  describe('Retrieve an specific charge', () => {
    it('When a charge is requested, then the correct charge object is returned', async () => {
      const mockedCharge = getCharge();

      jest.spyOn(stripe.charges, 'retrieve').mockResolvedValue(mockedCharge as Stripe.Response<Stripe.Charge>);

      const charge = await paymentService.retrieveCustomerChargeByChargeId(mockedCharge.id);

      expect(charge).toStrictEqual(mockedCharge);
    });
  });

  describe('Subscribe', () => {
    const customerId = 'cus_test_123';
    const recurringPriceId = 'price_recurring_123';
    const oneTimePriceId = 'price_onetime_123';

    test('When subscribing with a recurring price, then it creates a subscription and returns the correct data', async () => {
      const maxSpaceBytes = '107374182400';
      const mockedPrice = getPrice({
        id: recurringPriceId,
        type: 'recurring',
        metadata: {
          maxSpaceBytes,
        },
      });
      const mockedSubscription = getCreatedSubscription({
        customer: customerId,
        items: {
          data: [
            {
              price: mockedPrice,
            },
          ],
        } as any,
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(mockedPrice as Stripe.Response<Stripe.Price>);
      const subscriptionCreateSpy = jest
        .spyOn(stripe.subscriptions, 'create')
        .mockResolvedValue(mockedSubscription as Stripe.Response<Stripe.Subscription>);

      const result = await paymentService.subscribe(customerId, recurringPriceId);

      expect(stripe.prices.retrieve).toHaveBeenCalledWith(recurringPriceId);
      expect(subscriptionCreateSpy).toHaveBeenCalledWith({
        customer: customerId,
        items: [
          {
            price: recurringPriceId,
          },
        ],
      });
      expect(result).toEqual({
        maxSpaceBytes: parseInt(maxSpaceBytes),
        recurring: true,
      });
    });

    test('When subscribing with a one-time price, then it creates an invoice, adds invoice items, pays out of band and returns the correct data', async () => {
      const maxSpaceBytes = '107374182400';
      const mockedPrice = getPrice({
        id: oneTimePriceId,
        type: 'one_time',
        metadata: {
          maxSpaceBytes,
        },
      });
      const mockedInvoice = getInvoice({
        id: 'inv_test_123',
        customer: customerId,
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(mockedPrice as Stripe.Response<Stripe.Price>);
      const invoiceCreateSpy = jest
        .spyOn(stripe.invoices, 'create')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      const invoiceItemCreateSpy = jest
        .spyOn(stripe.invoiceItems, 'create')
        .mockResolvedValue({} as Stripe.Response<Stripe.InvoiceItem>);
      const invoicePaySpy = jest
        .spyOn(stripe.invoices, 'pay')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);

      const result = await paymentService.subscribe(customerId, oneTimePriceId);

      expect(stripe.prices.retrieve).toHaveBeenCalledWith(oneTimePriceId);
      expect(invoiceCreateSpy).toHaveBeenCalledWith({
        customer: customerId,
        auto_advance: false,
        pending_invoice_items_behavior: 'include',
        metadata: {
          'affiliate-code': null,
          'affiliate-provider': null,
        },
      });
      expect(invoiceItemCreateSpy).toHaveBeenCalledWith({
        customer: customerId,
        price: oneTimePriceId,
        quantity: 0,
        description: 'One-time charge',
        invoice: mockedInvoice.id,
      });
      expect(invoicePaySpy).toHaveBeenCalledWith(mockedInvoice.id, {
        paid_out_of_band: true,
      });
      expect(result).toEqual({
        maxSpaceBytes: parseInt(maxSpaceBytes),
        recurring: false,
      });
    });

    test('When subscribing with a one-time price and license code, then it includes license code information in the invoice metadata', async () => {
      const maxSpaceBytes = '107374182400';
      const licenseCode = {
        code: 'AFFILIATE123',
        provider: 'PartnerCompany',
      };
      const mockedPrice = getPrice({
        id: oneTimePriceId,
        type: 'one_time',
        metadata: {
          maxSpaceBytes,
        },
      });
      const mockedInvoice = getInvoice({
        id: 'inv_test_456',
        customer: customerId,
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(mockedPrice as Stripe.Response<Stripe.Price>);
      const invoiceCreateSpy = jest
        .spyOn(stripe.invoices, 'create')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      const invoiceItemCreateSpy = jest
        .spyOn(stripe.invoiceItems, 'create')
        .mockResolvedValue({} as Stripe.Response<Stripe.InvoiceItem>);
      jest.spyOn(stripe.invoices, 'pay').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);

      const result = await paymentService.subscribe(customerId, oneTimePriceId, licenseCode);

      expect(invoiceCreateSpy).toHaveBeenCalledWith({
        customer: customerId,
        auto_advance: false,
        pending_invoice_items_behavior: 'include',
        metadata: {
          'affiliate-code': licenseCode.code,
          'affiliate-provider': licenseCode.provider,
        },
      });
      expect(invoiceItemCreateSpy).toHaveBeenCalledWith({
        customer: customerId,
        price: oneTimePriceId,
        quantity: 0,
        description: expect.stringContaining(licenseCode.provider),
        invoice: mockedInvoice.id,
      });
      expect(result).toEqual({
        maxSpaceBytes: parseInt(maxSpaceBytes),
        recurring: false,
      });
    });
  });

  describe('Annual commitment cancellation info', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    test('when the user just subscribed this month, then they have 12 remaining payments and cancel date is one year from now', () => {
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscriptionEntity = getSubscriptionEntity({
        startDate: dayjs('2026-05-01T00:00:00Z').unix(),
      });
      const { remainingMonths, cancelAt } = paymentService.getAnnualCommitmentCancellationInfo(subscriptionEntity);

      expect(remainingMonths).toBe(12);
      expect(dayjs.unix(cancelAt).year()).toBe(2027);
      expect(dayjs.unix(cancelAt).month()).toBe(4);
    });

    test('when the user has been subscribed for 7 months, then they have 5 remaining payments', () => {
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscriptionEntity = getSubscriptionEntity({
        startDate: dayjs('2025-10-01T00:00:00Z').unix(),
      });
      const { remainingMonths } = paymentService.getAnnualCommitmentCancellationInfo(subscriptionEntity);

      expect(remainingMonths).toBe(5);
    });

    test('when the user completes exactly 12 months and starts a new period, then they have 12 remaining payments again', () => {
      jest.setSystemTime(dayjs('2026-10-01T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2025-10-01T00:00:00Z').unix() });
      const { remainingMonths, cancelAt } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(remainingMonths).toBe(12);
      expect(dayjs.unix(cancelAt).year()).toBe(2027);
    });

    test('when the user has been subscribed for 14 months, then they have 10 remaining payments and cancel date is in the second year', () => {
      jest.setSystemTime(dayjs('2026-12-01T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2025-10-01T00:00:00Z').unix() });
      const { remainingMonths, cancelAt } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(remainingMonths).toBe(10);
      expect(dayjs.unix(cancelAt).year()).toBe(2027);
    });

    test('when the user has 1 month left in the period, then they have 1 remaining payment', () => {
      jest.setSystemTime(dayjs('2026-09-01T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2025-10-01T00:00:00Z').unix() });
      const { remainingMonths } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(remainingMonths).toBe(1);
    });

    test('when the user subscribed less than 30 days ago, then they are still in their first month', () => {
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2026-04-28T10:00:00Z').unix() });
      const { isElegibleForCancellation } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(isElegibleForCancellation).toBe(true);
    });

    test('when the user subscribed more than 30 days ago, then they are no longer in their first month', () => {
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2026-03-01T10:00:00Z').unix() });
      const { isElegibleForCancellation } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(isElegibleForCancellation).toBe(false);
    });

    test('when the user has completed a full year and starts a new cycle, then they are not considered in their first month', () => {
      jest.setSystemTime(dayjs('2026-10-01T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2025-10-01T00:00:00Z').unix() });
      const { isElegibleForCancellation } = paymentService.getAnnualCommitmentCancellationInfo(subscription);

      expect(isElegibleForCancellation).toBe(false);
    });
  });

  describe('Cancelling a subscription', () => {
    test('when the subscription has an annual commitment, then it schedules the cancellation at the end of the commitment period instead of cancelling immediately', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2025-10-01T00:00:00Z').unix() });
      const price = getPriceEntity({ commitmentPlan: true });

      jest.spyOn(stripePaymentsAdapter, 'getSubscription').mockResolvedValue(subscription);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(price);
      const updateSpy = jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(subscription as unknown as any);
      const cancelSpy = jest.spyOn(stripe.subscriptions, 'cancel').mockResolvedValue(undefined as any);

      await paymentService.cancelSubscription(subscription.id);

      const expectedCancelAt = dayjs.unix(subscription.startDate).add(1, 'year').unix();
      expect(updateSpy).toHaveBeenCalledWith(subscription.id, { cancel_at: expectedCancelAt });
      expect(cancelSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('when the subscription has annual commitment but the user just subscribed this month, then it cancels immediately without waiting for the year to end', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscription = getSubscriptionEntity({ startDate: dayjs('2026-04-28T00:00:00Z').unix() });
      const price = getPriceEntity({ commitmentPlan: true });

      jest.spyOn(stripePaymentsAdapter, 'getSubscription').mockResolvedValue(subscription);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(price);
      const deleteSpy = jest.spyOn(stripePaymentsAdapter, 'cancelSubscription').mockResolvedValue();
      const updateSpy = jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(undefined as any);

      await paymentService.cancelSubscription(subscription.id);

      expect(deleteSpy).toHaveBeenCalledWith(subscription.id);
      expect(updateSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('when the subscription has no annual commitment, then it cancels immediately', async () => {
      const subscription = getSubscriptionEntity();
      const price = getPriceEntity({ commitmentPlan: false });

      jest.spyOn(stripePaymentsAdapter, 'getSubscription').mockResolvedValue(subscription);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(price);
      const deleteSpy = jest.spyOn(stripePaymentsAdapter, 'cancelSubscription').mockResolvedValue();
      const updateSpy = jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(undefined as any);

      await paymentService.cancelSubscription(subscription.id);

      expect(deleteSpy).toHaveBeenCalledWith(subscription.id);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Reactivating a subscription', () => {
    test('when the subscription has a scheduled cancellation, then it clears the cancel_at so it keeps renewing', async () => {
      const subscription = getSubscriptionEntity({ cancelAt: dayjs().add(1, 'month').unix() });

      jest.spyOn(stripePaymentsAdapter, 'getSubscription').mockResolvedValue(subscription);
      const updateSpy = jest.spyOn(stripePaymentsAdapter, 'updateSubscription').mockResolvedValue(subscription);

      await paymentService.reactivateSubscription(subscription.id);

      expect(updateSpy).toHaveBeenCalledWith(subscription.id, { cancel_at: '' });
    });

    test('when the subscription has no scheduled cancellation, then an error is thrown and no update is made', async () => {
      const subscription = getSubscriptionEntity({ cancelAt: undefined });

      jest.spyOn(stripePaymentsAdapter, 'getSubscription').mockResolvedValue(subscription);
      const updateSpy = jest.spyOn(stripePaymentsAdapter, 'updateSubscription').mockResolvedValue(subscription);

      await expect(paymentService.reactivateSubscription(subscription.id)).rejects.toThrow(BadRequestError);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Changing the subscription plan', () => {
    const mockPlanChange = () => {
      const subscription = getCreatedSubscription();
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([subscription as any]);
      jest
        .spyOn(stripe.prices, 'retrieve')
        .mockResolvedValue(getPrice({ product: getProduct({ params: { metadata: {} } }) }) as any);
      jest.spyOn(stripe.invoices, 'retrieve').mockResolvedValue({ payment_intent: null } as any);
      return jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(subscription as any);
    };

    test('When the plan is changed with a coupon, then the coupon is applied to the subscription', async () => {
      const updateSpy = mockPlanChange();

      await paymentService.updateSubscriptionPrice({
        customerId: 'cus_test',
        priceId: 'price_new',
        couponCode: 'coupon_1',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ discounts: [{ coupon: 'coupon_1' }], billing_cycle_anchor: 'now' }),
      );
    });

    test('When the plan is changed without a coupon, then the current discounts of the subscription are kept', async () => {
      const updateSpy = mockPlanChange();

      await paymentService.updateSubscriptionPrice({ customerId: 'cus_test', priceId: 'price_new' });

      expect(updateSpy.mock.calls[0][1]).not.toHaveProperty('discounts');
    });
  });

  describe('Getting the user subscription', () => {
    const makeActiveSubscription = (priceMetadata: Record<string, string> = {}, overrides = {}) => {
      const base = getCreatedSubscription();
      const price = getPrice({ metadata: { maxSpaceBytes: '107374182400', ...priceMetadata } });
      const product = getProduct({});
      return {
        ...base,
        plan: {
          ...base.items.data[0].plan,
          product,
          amount: 999,
          currency: 'eur',
          interval: 'month',
          interval_count: 1,
          intervalCount: 1,
          nickname: 'monthly',
        },
        items: { ...base.items, data: [{ ...base.items.data[0], price }] },
        current_period_end: 1800000000,
        ...overrides,
      } as any;
    };

    const mockUpcomingInvoice = (
      totals: { total: number; total_excluding_tax: number | null } = { total: 999, total_excluding_tax: 999 },
    ) => {
      jest.spyOn(stripe.invoices, 'createPreview').mockResolvedValue(totals as any);
    };

    test('when the user has no active subscription, then it returns a free plan', async () => {
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);

      const result = await paymentService.getUserSubscription('cus_test', UserType.Individual);

      expect(result).toEqual({ type: 'free' });
    });

    test('when the user has an active individual subscription without annual commitment, then it returns the subscription details', async () => {
      const subscription = makeActiveSubscription();
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([subscription]);
      mockUpcomingInvoice();

      const result = await paymentService.getUserSubscription('cus_test', UserType.Individual);

      expect(result.type).toBe('subscription');
      if (result.type === 'subscription') {
        expect(result.plan.commitment.enabled).toBe(false);
        expect(result.plan.commitment.remainingMonths).toBeUndefined();
      }
    });

    test('when the user has an active subscription with annual commitment, then it includes the remaining months and cancellation date', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(dayjs('2026-05-05T10:00:00Z').toDate());

      const subscription = makeActiveSubscription(
        { annualCommitment: 'true' },
        { start_date: dayjs('2025-10-01T00:00:00Z').unix() },
      );
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([subscription]);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(getPriceEntity());
      mockUpcomingInvoice();

      const result = await paymentService.getUserSubscription('cus_test', UserType.Individual);

      const expectedCancellationDate = dayjs('2025-10-01T00:00:00Z').add(1, 'year').toISOString();

      if (result.type === 'subscription') {
        expect(result.plan.commitment.enabled).toBe(true);
        expect(result.plan.commitment.remainingMonths).toBe(5);
        expect(result.plan.commitment.cancellationDate).toBe(expectedCancellationDate);
      }

      jest.useRealTimers();
    });

    test('when the next invoice includes taxes, then the subscription shows taxes as enabled', async () => {
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([makeActiveSubscription()]);
      mockUpcomingInvoice({ total: 1210, total_excluding_tax: 1000 });

      const result = await paymentService.getUserSubscription('cus_test', UserType.Individual);

      expect(result.type === 'subscription' && result.plan.tax?.enabled).toBe(true);
    });

    test('when the next invoice has no taxes, then the subscription shows taxes as disabled', async () => {
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([makeActiveSubscription()]);
      mockUpcomingInvoice({ total: 1000, total_excluding_tax: 1000 });

      const result = await paymentService.getUserSubscription('cus_test', UserType.Individual);

      expect(result.type === 'subscription' && result.plan.tax?.enabled).toBe(false);
    });

    test('when the user has a business subscription, then it returns the subscription with business type', async () => {
      const subscription = makeActiveSubscription({}, { product: { metadata: { type: 'business' } } });
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([subscription]);
      mockUpcomingInvoice();

      jest
        .spyOn(paymentService['productsRepository'], 'findByType')
        .mockResolvedValue([{ paymentGatewayId: subscription.items.data[0].price.product } as any]);

      const result = await paymentService.getUserSubscription('cus_test', UserType.Business);

      expect(result.type).toBe('subscription');
    });
  });

  describe('Charge remaining subscription amount', () => {
    const customerEntity = getCustomerEntity();
    const priceEntity = getPriceEntity();
    test('When the user subscription ends this month(last month of commitment), then an error indicating so is thrown', async () => {
      const subscription = getSubscriptionEntity({ startDate: dayjs().subtract(11, 'month').unix() });
      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(customerEntity);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(priceEntity);

      await expect(paymentService.createEarlyCancellationCharge(subscription)).rejects.toThrow(
        SubscriptionNotEligibleForEarlyChargeError,
      );
    });

    test('When the user does not have a default payment method, then an error indicating so is thrown', async () => {
      const subscription = getSubscriptionEntity({ paymentMethod: undefined });
      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(customerEntity);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(priceEntity);

      await expect(paymentService.createEarlyCancellationCharge(subscription)).rejects.toThrow(
        PaymentMethodNotFoundError,
      );
    });

    test('When there is no client secret id when finalizing the invoice, then an error indicating so is thrown', async () => {
      const subscription = getSubscriptionEntity({ paymentMethod: 'pm_test_default' });
      const invoiceEntity = getInvoiceEntity({
        clientSecretId: undefined,
      });
      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(customerEntity);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(priceEntity);
      jest.spyOn(stripePaymentsAdapter, 'createInvoice').mockResolvedValue(invoiceEntity);
      jest.spyOn(stripePaymentsAdapter, 'addInvoiceItems').mockResolvedValue(invoiceEntity);
      jest.spyOn(stripePaymentsAdapter, 'finalizeInvoice').mockResolvedValue(invoiceEntity);

      await expect(paymentService.createEarlyCancellationCharge(subscription)).rejects.toThrow(
        ClientSecretNotFoundError,
      );
    });

    test('When the user has a subscription, then the remaining subscription amount is charged', async () => {
      const subscription = getSubscriptionEntity({ paymentMethod: 'pm_test_default' });
      const invoiceEntity = getInvoiceEntity({
        clientSecretId: 'pi_test_secret',
      });
      const invoiceItemsEntity = getInvoiceItemsEntity();
      const expectedClientSecret = 'pi_test_secret';
      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(customerEntity);
      jest.spyOn(stripePaymentsAdapter, 'getPriceById').mockResolvedValue(priceEntity);
      jest.spyOn(stripePaymentsAdapter, 'createInvoice').mockResolvedValue(invoiceEntity);
      const addInvoiceItemsSpy = jest
        .spyOn(stripePaymentsAdapter, 'addInvoiceItems')
        .mockResolvedValue(invoiceItemsEntity);
      jest.spyOn(stripePaymentsAdapter, 'finalizeInvoice').mockResolvedValue(invoiceEntity);

      const result = await paymentService.createEarlyCancellationCharge(subscription);

      expect(result).toStrictEqual({ clientSecret: expectedClientSecret });
      expect(addInvoiceItemsSpy).toHaveBeenCalledWith(
        invoiceEntity.id,
        subscription.customer,
        expect.objectContaining({
          description: expect.any(String),
          amount: expect.any(Number),
          metadata: { price_id: subscription.priceId },
        }),
      );
    });
  });
});
