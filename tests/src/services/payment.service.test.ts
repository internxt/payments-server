import { Reason } from '../../../src/services/payment.service';
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
  getValidUserToken,
} from '../fixtures';
import { BadRequestError, NotFoundError } from '../../../src/errors/Errors';
import { createTestServices } from '../helpers/services-factory';
import Stripe from 'stripe';
import { stripeNewVersion } from '../../../src/services/stripe';
import config from '../../../src/config';
import { generateQrCodeUrl } from '../../../src/utils/generateQrCodeUrl';
import jwt from 'jsonwebtoken';

describe('Payments Service tests', () => {
  const { paymentService, stripe, bit2MeService } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

  describe('Get a price given its ID', () => {
    it('When the price exists, then it is returned', async () => {
      const mockedPrice = getPrice();
      const priceSpy = jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);

      const price = await paymentService.getPrice(mockedPrice.id);

      expect(priceSpy).toHaveBeenCalledWith(mockedPrice.id);
      expect(price).toEqual(mockedPrice);
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
        userEmail: mockedInvoice.customer_email as string,
        userAddress: '1.1.1.1',
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
      const mockedPrice = getPrice({
        id: 'mockedPriceId',
      });

      jest
        .spyOn(stripeNewVersion.invoices, 'create')
        .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(stripeNewVersion.invoiceItems, 'create')
        .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValueOnce(mockedPrice);
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
        userEmail: mockedInvoice.customer_email as string,
        userAddress: '1.1.1.1',
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
      const mockedPrice = getPrice({
        id: 'mockedPriceId',
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
      jest.spyOn(paymentService, 'getPrice').mockResolvedValueOnce(mockedPrice);
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
        userEmail: mockedInvoice.customer_email as string,
        userAddress: '1.1.1.1',
      });

      expect(paymentIntent).toEqual(mockedPaymentIntent);
    });

    describe('Crypto payments', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      test('When trying to purchase a product using a crypto currency, then the QR code link is returned', async () => {
        const mockInvoiceTotal = 1000;
        const mockedCustomer = getCustomer();
        const mockedCustomerEmail = mockedCustomer.email as string;
        const mockedCustomerId = mockedCustomer.id as string;
        const mockedPrice = getPrice({
          type: 'one_time',
        });
        const mockedPriceId = mockedPrice.id as string;
        const mockInvoiceId = 'in_test_456';
        const mockCurrency = 'BTC';

        const mockedInvoice = getInvoice({
          id: mockInvoiceId,
          customer: mockedCustomerId,
          customer_email: mockedCustomerEmail,
          status: 'open',
          payments: {
            data: [
              {
                payment: {
                  payment_intent: 'payment_intent_id',
                },
              },
            ],
          },
          total: mockInvoiceTotal,
          amount_remaining: mockInvoiceTotal,
          lines: {
            data: [
              {
                amount: mockInvoiceTotal,
                pricing: {
                  price_details: {
                    price: mockedPriceId,
                  },
                },
                currency: 'eth',
              },
            ],
          },
        });

        const mockedParsedInvoiceResponse = getParsedInvoiceResponse();
        const mockedParsedCreatedInvoiceResponse = getParsedCreatedInvoiceResponse({
          status: 'new',
        });

        const expectedSecurityToken = jwt.sign(
          {
            invoiceId: mockInvoiceId,
            customerId: mockedCustomerId,
            provider: 'stripe',
          },
          config.JWT_SECRET,
        );

        jest
          .spyOn(paymentService, 'getCustomer')
          .mockResolvedValueOnce(mockedCustomer as Stripe.Response<Stripe.Customer>);
        jest
          .spyOn(stripeNewVersion.invoices, 'create')
          .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
        jest
          .spyOn(stripeNewVersion.invoiceItems, 'create')
          .mockResolvedValueOnce(mockedInvoice.lines.data[0] as unknown as Stripe.Response<Stripe.InvoiceItem>);

        jest.spyOn(stripe.invoices, 'update').mockImplementation();
        jest
          .spyOn(stripeNewVersion.invoices, 'retrieve')
          .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
        jest
          .spyOn(stripeNewVersion.invoices, 'finalizeInvoice')
          .mockResolvedValueOnce(mockedInvoice as unknown as Stripe.Response<Stripe.Invoice>);
        jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
        const createCryptoInvoiceSpy = jest
          .spyOn(bit2MeService, 'createCryptoInvoice')
          .mockResolvedValueOnce(mockedParsedCreatedInvoiceResponse);
        const checkoutInvoiceSpy = jest
          .spyOn(bit2MeService, 'checkoutInvoice')
          .mockResolvedValueOnce(mockedParsedInvoiceResponse);

        const paymentIntent = await paymentService.createInvoice({
          customerId: mockedCustomerId,
          priceId: mockedPriceId,
          currency: mockCurrency,
          userEmail: mockedCustomerEmail as string,
          userAddress: '1.1.1.1',
        });

        expect(paymentIntent).toStrictEqual({
          id: mockedInvoice.payments?.data[0].payment.payment_intent as string,
          type: 'crypto',
          token: getValidUserToken({ invoiceId: mockedParsedInvoiceResponse.invoiceId }),
          payload: {
            paymentRequestUri: mockedParsedInvoiceResponse.paymentRequestUri,
            url: mockedParsedInvoiceResponse.url,
            qrUrl: generateQrCodeUrl({ data: mockedParsedInvoiceResponse.paymentRequestUri }),
            payAmount: mockedParsedInvoiceResponse.payAmount,
            payCurrency: mockedParsedInvoiceResponse.payCurrency,
            paymentAddress: mockedParsedInvoiceResponse.paymentAddress,
          },
        });

        expect(createCryptoInvoiceSpy).toHaveBeenCalledWith({
          description: `Payment for lifetime product ${mockedPriceId}`,
          priceAmount: mockInvoiceTotal / 100,
          priceCurrency: 'BTC',
          title: `Invoice from Stripe ${mockInvoiceId}`,
          securityToken: expectedSecurityToken,
          foreignId: mockInvoiceId,
          cancelUrl: `${config.DRIVE_WEB_URL}/checkout/cancel`,
          successUrl: `${config.DRIVE_WEB_URL}/checkout/success`,
          purchaserEmail: mockedCustomerEmail,
          shopper: {
            addressLine: mockedCustomer.address?.line1,
            city: mockedCustomer.address?.city,
            countryOfResidence: mockedCustomer.address?.country,
            dateOfBirth: '',
            email: mockedCustomerEmail,
            firstName: mockedCustomer.name,
            ipAddress: '1.1.1.1',
            lastName: '',
            postalCode: mockedCustomer.address?.postal_code,
            type: 'personal',
          },
        });

        expect(checkoutInvoiceSpy).toHaveBeenCalledWith(
          mockedParsedCreatedInvoiceResponse.invoiceId,
          mockCurrency.toUpperCase(),
        );
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

  describe('Retrieve an invoice given its ID', () => {
    it('When an invoice is requested, then the correct invoice object is returned', async () => {
      const mockedInvoice = getInvoice();

      jest.spyOn(stripe.invoices, 'retrieve').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);

      const invoice = await paymentService.getInvoice(mockedInvoice.id);

      expect(invoice).toStrictEqual(mockedInvoice);
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
});
