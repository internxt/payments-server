import Stripe from 'stripe';
import axios from 'axios';
import {
  PaymentIntent,
  PaymentService,
  PromotionCode,
  SubscriptionCreated,
} from '../../../src/services/payment.service';
import testFactory from '../utils/factory';
import envVariablesConfig from '../../../src/config';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import getMocks from '../mocks';
import { Bit2MeService, Currency } from '../../../src/services/bit2me.service';
import { UserType } from '../../../src/core/users/User';

let productsRepository: ProductsRepository;
let paymentService: PaymentService;
let bit2MeService: Bit2MeService;
let stripe: Stripe;

const mocks = getMocks();

describe('Payments Service tests', () => {
  beforeEach(() => {
    productsRepository = testFactory.getProductsRepositoryForTest();
    bit2MeService = new Bit2MeService(envVariablesConfig, axios);
    stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);
  });

  describe('Creating a customer', () => {
    it('When trying to create a customer with the correct params, then the customer is created successfully', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockImplementation(() => Promise.resolve(mocks.mockedUserWithoutLifetime as unknown as Stripe.Customer));

      await paymentService.createCustomer(mocks.mockedCustomerPayload);

      expect(customerCreatedSpy).toHaveBeenCalledWith(mocks.mockedCustomerPayload);
    });
  });

  describe('Fetching the promotion code object', () => {
    it('When requesting the Promotion Code with the correct params, then returns the promoCodeId, name, amount off and/or discount off', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'getPromotionCodeByName')
        .mockImplementation(() => Promise.resolve(mocks.mockPromotionCodeResponse as unknown as PromotionCode));

      const promotionCode = await paymentService.getPromotionCodeByName(
        mocks.prices.subscription.exists,
        mocks.couponName.valid,
      );

      expect(customerCreatedSpy).toHaveBeenCalledWith(mocks.prices.subscription.exists, mocks.couponName.valid);
      expect(promotionCode).toEqual(mocks.mockPromotionCodeResponse);
    });
  });

  describe('Creating a subscription', () => {
    it('When trying to create a subscription with the correct params, then it is successfully created', async () => {
      const subscriptionCreatedSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockImplementation(() =>
          Promise.resolve(mocks.mockCreateSubscriptionResponse as unknown as SubscriptionCreated),
        );

      const subscription = await paymentService.createSubscription({
        customerId: mocks.createdSubscriptionPayload.customerId,
        priceId: mocks.createdSubscriptionPayload.priceId,
        promoCodeId: mocks.createdSubscriptionPayload.promotion_code,
      });

      expect(subscriptionCreatedSpy).toHaveBeenCalledWith({
        customerId: mocks.createdSubscriptionPayload.customerId,
        priceId: mocks.createdSubscriptionPayload.priceId,
        promoCodeId: mocks.createdSubscriptionPayload.promotion_code,
      });
      expect(subscription).toEqual(mocks.mockCreateSubscriptionResponse);
    });
  });

  describe('Obtain the paymentIntent customer secret', () => {
    it('When fetching the Payment Intent customer with the correct payload, then returns the client secret to pay in the client side', async () => {
      const paymentIntentSpy = jest
        .spyOn(paymentService, 'createPaymentIntent')
        .mockImplementation(() => Promise.resolve(mocks.paymentIntentResponse as unknown as PaymentIntent));

      const paymentIntent = await paymentService.createPaymentIntent(
        mocks.createdSubscriptionPayload.customerId,
        mocks.createdSubscriptionPayload.amount,
        mocks.createdSubscriptionPayload.priceId,
        mocks.createdSubscriptionPayload.promotion_code,
      );
      expect(paymentIntentSpy).toHaveBeenCalledWith(
        mocks.createdSubscriptionPayload.customerId,
        mocks.createdSubscriptionPayload.amount,
        mocks.createdSubscriptionPayload.priceId,
        mocks.createdSubscriptionPayload.promotion_code,
      );
      expect(paymentIntent).toEqual(mocks.paymentIntentResponse);
    });
  });

  describe('getCryptoCurrencies()', () => {
    it('When listing the currencies, then only return the crypto ones', async () => {
      const expected: Currency[] = [
        {
          currencyId: 'BTC',
          name: 'Bitcoin',
          type: 'crypto',
          receiveType: true,
          networks: [
            {
              platformId: 'bitcoin',
              name: 'bitcoin',
            },
          ],
          imageUrl: 'https://some-image.jpg',
        },
      ];
      jest.spyOn(bit2MeService, 'getCurrencies').mockReturnValue(
        Promise.resolve([
          expected[0],
          {
            currencyId: 'EUR',
            name: 'Euro',
            type: 'fiat',
            receiveType: true,
            networks: [],
            imageUrl: 'https://some-image.jpg',
          },
        ]),
      );

      const received = await paymentService.getCryptoCurrencies();

      expect(received).toStrictEqual(expected);
    });
  });

  describe('markInvoiceAsPaid()', () => {
    it('When the invoice id is invalid, then it throws an error', async () => {
      await expect(paymentService.markInvoiceAsPaid('invalid-invoice-id')).rejects.toThrow();
    });

    it('When the invoice id is valid, then it marks it as paid', async () => {
      const invoiceId = 'in_eir9242';
      const paySpy = jest
        .spyOn(stripe.invoices, 'pay')
        .mockImplementation(() => Promise.resolve(null as unknown as Stripe.Response<Stripe.Invoice>));

      await paymentService.markInvoiceAsPaid(invoiceId);

      expect(paySpy).toHaveBeenCalledWith(invoiceId, {
        paid_out_of_band: true,
      });
    });
  });

  describe('getDefaultPaymentMethod()', () => {
    const mockProvider = {
      paymentMethods: {
        list: jest.fn(),
      },
      customers: {
        retrieve: jest.fn(),
      },
    };

    const mockGetActiveSubscriptions = jest.fn();

    const customerId = 'test-customer-id';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('when user is lifetime individual, then returns the payment method', async () => {
      const mockPaymentMethods = [{ id: 'pm_1' }];
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
      const mockSubscriptions = [
        {
          default_payment_method: { id: 'pm_default' },
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
      const mockSubscriptions = [
        {
          default_source: { id: 'source_default' },
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

  describe('getDriveInvoices()', () => {
    const mockCustomerId = mocks.mockedUserWithoutLifetime.customerId;
    const mockPagination = { limit: 10, startingAfter: 'inv_123' };
    const mockSubscriptionId = mocks.mockActiveSubscriptions[0].id;

    const { mockInvoices } = mocks;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockInvoices as unknown as Stripe.Invoice[]);
    });

    it('When userType is Individual, then returns filtered invoices with individual type', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockInvoices as unknown as Stripe.Invoice[]);

      const result = await paymentService.getDriveInvoices(mockCustomerId, mockPagination, UserType.Individual);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(mockCustomerId, mockPagination, undefined);
      expect(result).toEqual([
        {
          id: mockInvoices[0].id,
          created: mockInvoices[0].created,
          pdf: mockInvoices[0].invoice_pdf,
          bytesInPlan: mockInvoices[0].lines.data[0].price.metadata.maxSpaceBytes,
          total: mockInvoices[0].total,
          currency: mockInvoices[0].currency,
        },
      ]);
    });

    it('When userType is Business, then returns filtered invoices with business type', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockInvoices as unknown as Stripe.Invoice[]);

      const result = await paymentService.getDriveInvoices(mockCustomerId, mockPagination, UserType.Business);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(mockCustomerId, mockPagination, undefined);
      expect(result).toEqual([
        {
          id: mockInvoices[1].id,
          created: mockInvoices[1].created,
          pdf: mockInvoices[1].invoice_pdf,
          bytesInPlan: mockInvoices[1].lines.data[0].price.metadata.maxSpaceBytes,
          total: mockInvoices[1].total,
          currency: mockInvoices[1].currency,
        },
      ]);
    });

    it('When a subscriptionId is provided, then filters invoices by subscriptionId', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockInvoices as unknown as Stripe.Invoice[]);

      const result = await paymentService.getDriveInvoices(
        mockCustomerId,
        mockPagination,
        UserType.Individual,
        mockSubscriptionId,
      );

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(
        mockCustomerId,
        mockPagination,
        mockSubscriptionId,
      );
      expect(result).toEqual(
        mockInvoices.map((invoice) => ({
          id: invoice.id,
          created: invoice.created,
          pdf: invoice.invoice_pdf,
          bytesInPlan: invoice.lines.data[0].price.metadata.maxSpaceBytes,
          total: invoice.total,
          currency: invoice.currency,
        })),
      );
    });

    it('When no invoices match the filters, then returns an empty array', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([]);

      const result = await paymentService.getDriveInvoices(mockCustomerId, mockPagination, UserType.Individual);

      expect(paymentService.getInvoicesFromUser).toHaveBeenCalledWith(mockCustomerId, mockPagination, undefined);
      expect(result).toEqual([]);
    });

    it('When getInvoicesFromUser throws an error, then it propagates the error', async () => {
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockRejectedValue(new Error('Service error'));

      await expect(
        paymentService.getDriveInvoices(mockCustomerId, mockPagination, UserType.Individual),
      ).rejects.toThrow('Service error');
    });
  });
});
