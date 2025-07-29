import Stripe from 'stripe';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { PaymentService, Reason } from '../../../src/services/payment.service';
import testFactory from '../utils/factory';
import envVariablesConfig from '../../../src/config';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { UserType } from '../../../src/core/users/User';
import {
  getCharge,
  getCoupon,
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCurrencies,
  getCustomer,
  getInvoice,
  getInvoices,
  getParsedCreatedInvoiceResponse,
  getParsedInvoiceResponse,
  getPaymentIntent,
  getPaymentIntentResponse,
  getPaymentMethod,
  getPrice,
  getPrices,
  getPromoCode,
  getPromotionCodeResponse,
  getTaxes,
  getUser,
} from '../fixtures';
import { BadRequestError, NotFoundError } from '../../../src/errors/Errors';
import config from '../../../src/config';
import { generateQrCodeUrl } from '../../../src/utils/generateQrCodeUrl';

let productsRepository: ProductsRepository;
let paymentService: PaymentService;
let bit2MeService: Bit2MeService;
let stripe: Stripe;

describe('Payments Service tests', () => {
  beforeEach(() => {
    productsRepository = testFactory.getProductsRepositoryForTest();
    bit2MeService = new Bit2MeService(envVariablesConfig, axios);
    stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);
  });

  describe('Creating a customer', () => {
    it('When trying to create a customer with the correct params, then the customer is created successfully', async () => {
      const mockedCustomer = getCustomer();

      const createCustomerPayload = {
        email: mockedCustomer.email as string,
        name: mockedCustomer.name as string,
      };

      const customerCreatedSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockImplementation(() => Promise.resolve(mockedCustomer));

      await paymentService.createCustomer(createCustomerPayload);

      expect(customerCreatedSpy).toHaveBeenCalledWith(createCustomerPayload);
    });
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
        currency: mockedInvoice.lines.data[0].price?.currency,
        promoCodeId: ((mockedInvoice.discounts[0] as Stripe.Discount)?.promotion_code as Stripe.PromotionCode).code,
        userEmail: mockedInvoice.customer_email as string,
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
      const mockedInvoice = getInvoice();
      const mockedPaymentIntent = getPaymentIntentResponse({
        type: 'fiat',
      });

      jest
        .spyOn(stripe.invoices, 'create')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripe.invoiceItems, 'create')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest
        .spyOn(stripe.invoices, 'finalizeInvoice')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
        client_secret: mockedPaymentIntent.clientSecret as string,
      });

      const paymentIntent = await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: mockedInvoice.lines.data[0].price?.id as string,
        currency: mockedInvoice.lines.data[0].price?.currency,
        userEmail: mockedInvoice.customer_email as string,
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
      });
      const mockedPaymentIntent = getPaymentIntentResponse({
        clientSecret: '',
        id: '',
        invoiceStatus: 'paid',
      });

      jest
        .spyOn(stripe.invoices, 'create')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripe.invoiceItems, 'create')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest
        .spyOn(stripe.invoices, 'finalizeInvoice')
        .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
        ...(mockedPaymentIntent as unknown as Stripe.Response<Stripe.PaymentIntent>),
      });

      const paymentIntent = await paymentService.createInvoice({
        customerId: mockedInvoice.customer as string,
        priceId: mockedInvoice.lines.data[0].price?.id as string,
        currency: mockedInvoice.lines.data[0].price?.currency,
        userEmail: mockedInvoice.customer_email as string,
      });

      expect(paymentIntent).toEqual(mockedPaymentIntent);
    });

    describe('Crypto payments', () => {
      test('When trying to purchase a product using a crypto currency, then the QR code link is returned', async () => {
        const mockedInvoice = getInvoice({
          status: 'open',
          payment_intent: 'payment_intent_id',
          lines: {
            data: [
              {
                price: {
                  currency: 'BTC',
                  type: 'one_time',
                },
              },
            ],
          },
        });

        const mockedInvoiceId = mockedInvoice.id;
        const userEmail = mockedInvoice.customer_email as string;
        const mockedCurrency = 'BTC';

        const mockedParsedInvoiceResponse = getParsedInvoiceResponse();
        const mockedParsedCreatedInvoiceResponse = getParsedCreatedInvoiceResponse({
          status: 'new',
        });
        const mockedCryptoInvoiceId = mockedParsedCreatedInvoiceResponse.invoiceId;

        const mockedSecurityToken = jwt.sign(
          {
            stripeInvoiceId: mockedInvoice.id,
            customerId: mockedInvoice.customer as string,
          },
          config.JWT_SECRET,
        );

        jest
          .spyOn(stripe.invoices, 'create')
          .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
        jest
          .spyOn(stripe.invoiceItems, 'create')
          .mockResolvedValue(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
        jest
          .spyOn(stripe.invoices, 'finalizeInvoice')
          .mockResolvedValue(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);

        const createCryptoInvoiceSpy = jest
          .spyOn(bit2MeService, 'createCryptoInvoice')
          .mockResolvedValue(mockedParsedCreatedInvoiceResponse);

        const checkoutInvoiceSpy = jest
          .spyOn(bit2MeService, 'checkoutInvoice')
          .mockResolvedValue(mockedParsedInvoiceResponse);

        const paymentIntent = await paymentService.createInvoice({
          customerId: mockedInvoice.customer as string,
          priceId: mockedInvoice.lines.data[0].price?.id as string,
          currency: mockedCurrency,
          userEmail: userEmail,
        });

        expect(paymentIntent).toStrictEqual({
          id: mockedParsedInvoiceResponse.invoiceId,
          type: 'crypto',
          payload: {
            paymentAddressUri: mockedParsedInvoiceResponse.paymentRequestUri,
            url: mockedParsedInvoiceResponse.url,
            qrUrl: generateQrCodeUrl({ data: mockedParsedInvoiceResponse.paymentRequestUri }),
          },
        });

        expect(createCryptoInvoiceSpy).toHaveBeenCalledWith({
          description: expect.any(String),
          priceAmount: mockedInvoice.lines.data[0].price?.unit_amount as number,
          priceCurrency: mockedCurrency,
          title: expect.any(String),
          securityToken: mockedSecurityToken,
          foreignId: mockedInvoiceId,
          cancelUrl: expect.any(String),
          successUrl: expect.any(String),
          purchaserEmail: userEmail,
        });

        expect(checkoutInvoiceSpy).toHaveBeenCalledWith(mockedCryptoInvoiceId, mockedCurrency);
      });
    });
  });

  describe('Get Crypto currencies', () => {
    it('When listing the currencies, then only return the crypto ones', async () => {
      const mockedCurrencies = getCurrencies(2, [
        {
          currencyId: 'EUR',
          name: 'Euro',
          type: 'fiat',
          receiveType: true,
          networks: [],
          imageUrl: 'https://some-image.jpg',
        },
      ]);

      jest.spyOn(bit2MeService, 'getCurrencies').mockReturnValue(Promise.resolve(mockedCurrencies));

      const received = await paymentService.getCryptoCurrencies();

      expect(received).toStrictEqual([mockedCurrencies[1]]);
    });
  });

  describe('Mark an invoice as paid', () => {
    it('When the invoice id is invalid, then it throws an error', async () => {
      await expect(paymentService.markInvoiceAsPaid('invalid-invoice-id')).rejects.toThrow();
    });

    it('When the invoice id is valid, then it marks it as paid', async () => {
      const { id: invoiceId } = getInvoice();
      const paySpy = jest
        .spyOn(stripe.invoices, 'pay')
        .mockImplementation(() => Promise.resolve(null as unknown as Stripe.Response<Stripe.Invoice>));

      await paymentService.markInvoiceAsPaid(invoiceId);

      expect(paySpy).toHaveBeenCalledWith(invoiceId, {
        paid_out_of_band: true,
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

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined);
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

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined);
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

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, subscriptionId);
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

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(customerId, mockPagination, undefined);
      expect(result).toEqual([]);
    });

    it('When getInvoicesFromUser throws an error, then it propagates the error', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockRejectedValue(new Error('Service error'));

      await expect(paymentService.getDriveInvoices(customerId, mockPagination, UserType.Individual)).rejects.toThrow(
        'Service error',
      );
    });
  });

  describe('Creating a subscription with trial', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('When creating a subscription with trial, then it creates the sub with the correct trial end date', async () => {
      const fixedDate = new Date('2024-01-01T12:00:00Z');
      jest.setSystemTime(fixedDate);

      const expected = getCreateSubscriptionResponse();
      const payload = {
        customerId: getCustomer().id,
        priceId: getPrices().subscription.exists,
      };
      const trialReason: Reason = { name: 'pc-cloud-25' };

      const trialMonths = 6;
      const expectedTrialEnd = Math.floor(
        new Date(fixedDate.setMonth(fixedDate.getMonth() + trialMonths)).getTime() / 1000,
      );

      const createSubSpy = jest.spyOn(paymentService, 'createSubscription').mockResolvedValue(expected);

      const received = await paymentService.createSubscriptionWithTrial(payload, trialReason);

      expect(received).toStrictEqual(expected);
      expect(createSubSpy).toHaveBeenCalledWith({
        ...payload,
        trialEnd: expectedTrialEnd,
        metadata: { 'why-trial': trialReason.name },
      });
    });
  });

  describe('Fetch a price by its ID', () => {
    it('When the price does not exist, an error indicating so is thrown', async () => {
      const mockedPrices = getPrice();
      const invalidPriceId = 'invalid_price_id';

      jest.spyOn(paymentService, 'getPricesRaw').mockResolvedValue([mockedPrices]);

      await expect(paymentService.getPriceById(invalidPriceId)).rejects.toThrow(NotFoundError);
    });

    it('When the price exists, then the correct price object is returned', async () => {
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '123456789',
        },
      });
      const validPriceId = mockedPrice.id;
      const priceResponse = {
        id: validPriceId,
        currency: mockedPrice.currency,
        amount: mockedPrice.currency_options![mockedPrice.currency].unit_amount as number,
        bytes: parseInt(mockedPrice.metadata?.maxSpaceBytes),
        interval: mockedPrice.type === 'one_time' ? 'lifetime' : mockedPrice.recurring?.interval,
        decimalAmount: (mockedPrice.currency_options![mockedPrice.currency].unit_amount as number) / 100,
        product: mockedPrice.product as string,
        type: UserType.Individual,
      };
      jest.spyOn(paymentService, 'getPricesRaw').mockResolvedValue([mockedPrice]);

      const price = await paymentService.getPriceById(validPriceId);

      expect(price).toStrictEqual(priceResponse);
    });

    it('When the price exists and belongs to a business product, then the price is returned with minimum and maximum seats', async () => {
      const businessSeats = {
        minimumSeats: 1,
        maximumSeats: 3,
      };
      const mockedPrice = getPrice({
        metadata: {
          type: 'business',
          maxSpaceBytes: '123456789',
          minimumSeats: businessSeats.minimumSeats.toString(),
          maximumSeats: businessSeats.maximumSeats.toString(),
        },
      });
      const validPriceId = mockedPrice.id;
      const priceResponse = {
        id: validPriceId,
        currency: mockedPrice.currency,
        amount: mockedPrice.currency_options![mockedPrice.currency].unit_amount as number,
        bytes: parseInt(mockedPrice.metadata?.maxSpaceBytes),
        interval: mockedPrice.type === 'one_time' ? 'lifetime' : mockedPrice.recurring?.interval,
        decimalAmount: (mockedPrice.currency_options![mockedPrice.currency].unit_amount as number) / 100,
        product: mockedPrice.product as string,
        type: UserType.Business,
        ...businessSeats,
      };
      jest.spyOn(paymentService, 'getPricesRaw').mockResolvedValue([mockedPrice]);

      const price = await paymentService.getPriceById(validPriceId);

      expect(price).toStrictEqual(priceResponse);
    });
  });

  describe('Get tax for a price', () => {
    it('When the params are correct, then a tax object is returned for the requested price', async () => {
      const mockedPrice = getPrice();
      const mockedTaxes = getTaxes();
      jest
        .spyOn(stripe.tax.calculations, 'create')
        .mockResolvedValue(mockedTaxes as Stripe.Response<Stripe.Tax.Calculation>);

      const taxes = await paymentService.calculateTax(mockedPrice.id, mockedPrice.unit_amount as number, 'user_ip');

      expect(taxes).toStrictEqual(mockedTaxes);
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
});
