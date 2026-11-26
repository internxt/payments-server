import {
  getConfirmationToken,
  getCreatedSubscription,
  getCustomer,
  getInvoice,
  getInvoiceItems,
  getPaymentMethod,
  getPrice,
} from '../../fixtures';
import { StripeAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import Stripe from 'stripe';
import {
  InvalidConfirmationTokenError,
  InvalidTaxIdError,
  UserNotFoundError,
} from '../../../../src/errors/PaymentErrors';
import { BadRequestError } from '../../../../src/errors/Errors';
import { ConfirmationToken } from '../../../../src/infrastructure/domain/entities/confirmationToken';
import { Price } from '../../../../src/infrastructure/domain/entities/price';
import { UserType } from '../../../../src/core/users/User';
import { PRODUCT_BASE } from '../../fixtures/stripe-base.generated';
import { Subscription, SubscriptionStatus } from '../../../../src/infrastructure/domain/entities/subscription';
import { Invoice, InvoiceStatus } from '../../../../src/infrastructure/domain/entities/invoice';
import { InvoiceItems } from '../../../../src/infrastructure/domain/entities/invoiceItems';
import { EU_COUNTRIES, STRIPE_API_VERSION } from '../../../../src/constants';

const stripe = new Stripe('sk_test_stripe_adapter', { apiVersion: STRIPE_API_VERSION });
const stripeAdapter = new StripeAdapter(stripe);

describe('Stripe Adapter', () => {
  const stripeCustomer = (params?: Partial<Stripe.Customer>) =>
    getCustomer({
      id: 'cus_internxt',
      name: 'My internxt',
      email: 'example@internxt.com',
      address: {
        line1: 'Avenida el Port',
        line2: 'Angels',
        city: 'Valencia',
        state: 'Valencia',
        country: 'ES',
        postal_code: '46023',
      },
      phone: '+34600000000',
      metadata: { referralCode: 'ABC123' },
      ...params,
    });

  const mappedCustomer = {
    id: 'cus_internxt',
    name: 'My internxt',
    email: 'example@internxt.com',
    address: {
      line1: 'Avenida el Port',
      line2: 'Angels',
      city: 'Valencia',
      state: 'Valencia',
      country: 'ES',
      postalCode: '46023',
    },
    phone: '+34600000000',
    metadata: { referralCode: 'ABC123' },
    defaultPaymentMethod: undefined,
  };

  describe('Create customer', () => {
    test('When creating a customer, then Stripe receives its data and the customer is returned as plain data', async () => {
      const createSpy = jest
        .spyOn(stripe.customers, 'create')
        .mockResolvedValue(stripeCustomer() as Stripe.Response<Stripe.Customer>);

      const createdCustomer = await stripeAdapter.createCustomer({
        email: 'example@internxt.com',
        name: 'My internxt',
        address: { country: 'ES', postalCode: '46023' },
        metadata: { referralCode: 'ABC123' },
      });

      expect(createSpy).toHaveBeenCalledWith({
        email: 'example@internxt.com',
        name: 'My internxt',
        address: {
          line1: undefined,
          line2: undefined,
          city: undefined,
          state: undefined,
          country: 'ES',
          postal_code: '46023',
        },
        metadata: { referralCode: 'ABC123' },
      });
      expect(createdCustomer).toStrictEqual(mappedCustomer);
    });

    test('When Stripe returns the customer without an email, then a bad request error is thrown', async () => {
      jest
        .spyOn(stripe.customers, 'create')
        .mockResolvedValue(stripeCustomer({ email: null }) as Stripe.Response<Stripe.Customer>);

      await expect(stripeAdapter.createCustomer({ name: 'My internxt' })).rejects.toThrow(
        new BadRequestError('Customer email is required'),
      );
    });
  });

  describe('Update customer', () => {
    test('When updating a customer, then the updated customer is returned as plain data', async () => {
      jest.spyOn(stripe.customers, 'update').mockResolvedValue(stripeCustomer() as Stripe.Response<Stripe.Customer>);

      const updatedCustomer = await stripeAdapter.updateCustomer('cus_internxt', { name: 'My internxt' });

      expect(updatedCustomer).toStrictEqual(mappedCustomer);
    });

    test('When the address is not provided, then Stripe is not asked to change it', async () => {
      const updateSpy = jest
        .spyOn(stripe.customers, 'update')
        .mockResolvedValue(stripeCustomer({ name: 'Updated Name' }) as Stripe.Response<Stripe.Customer>);

      const result = await stripeAdapter.updateCustomer('cus_internxt', { name: 'Updated Name' });

      expect(updateSpy).toHaveBeenCalledWith('cus_internxt', { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
      expect(result.address).toStrictEqual(mappedCustomer.address);
    });
  });

  describe('Get customer', () => {
    test('When getting a customer, then the customer is returned as plain data', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue(stripeCustomer() as Stripe.Response<Stripe.Customer>);

      const customer = await stripeAdapter.getCustomer('cus_internxt');

      expect(customer).toStrictEqual(mappedCustomer);
    });

    test('When the customer has no name, then the default customer name is used', async () => {
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(stripeCustomer({ name: null }) as Stripe.Response<Stripe.Customer>);

      const customer = await stripeAdapter.getCustomer('cus_internxt');

      expect(customer.name).toBe('Internxt User');
    });

    test('When the customer pays by default with a payment method, then it is the default payment method', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue(
        stripeCustomer({
          invoice_settings: { default_payment_method: 'pm_invoices' } as Stripe.Customer.InvoiceSettings,
          default_source: 'card_legacy',
        }) as Stripe.Response<Stripe.Customer>,
      );

      const customer = await stripeAdapter.getCustomer('cus_internxt');

      expect(customer.defaultPaymentMethod).toBe('pm_invoices');
    });

    test('When Stripe sends the default payment method expanded, then its id is the default payment method', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue(
        stripeCustomer({
          invoice_settings: {
            default_payment_method: getPaymentMethod({ id: 'pm_expanded' }),
          } as Stripe.Customer.InvoiceSettings,
        }) as Stripe.Response<Stripe.Customer>,
      );

      const customer = await stripeAdapter.getCustomer('cus_internxt');

      expect(customer.defaultPaymentMethod).toBe('pm_expanded');
    });

    test('When the customer only has a legacy default source, then it is the default payment method', async () => {
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(stripeCustomer({ default_source: 'card_legacy' }) as Stripe.Response<Stripe.Customer>);

      const customer = await stripeAdapter.getCustomer('cus_internxt');

      expect(customer.defaultPaymentMethod).toBe('card_legacy');
    });

    test('When the customer was deleted, then an error indicating it does not exist is thrown', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue({ id: 'cus_internxt', deleted: true } as any);

      await expect(stripeAdapter.getCustomer('cus_internxt')).rejects.toThrow(UserNotFoundError);
    });
  });

  describe('Find customers by email', () => {
    test('When listing customers by email, then Stripe is asked for that exact email and they are returned as plain data', async () => {
      const listSpy = jest.spyOn(stripe.customers, 'list').mockResolvedValue({ data: [stripeCustomer()] } as any);

      const customers = await stripeAdapter.listCustomersByEmail('example@internxt.com');

      expect(listSpy).toHaveBeenCalledWith({ email: 'example@internxt.com' });
      expect(customers).toStrictEqual([mappedCustomer]);
    });

    test('When searching customers by email, then Stripe search is used and the ids of the matches are returned', async () => {
      const searchSpy = jest
        .spyOn(stripe.customers, 'search')
        .mockResolvedValue({ data: [getCustomer({ id: 'cus_first' }), getCustomer({ id: 'cus_second' })] } as any);

      const customerIds = await stripeAdapter.searchCustomerIdsByEmail('example@internxt.com');

      expect(searchSpy).toHaveBeenCalledWith({ query: "email:'example@internxt.com'" });
      expect(customerIds).toStrictEqual(['cus_first', 'cus_second']);
    });

    test('When no customer has that email, then an empty list is returned', async () => {
      jest.spyOn(stripe.customers, 'search').mockResolvedValue({ data: [] } as any);

      const customerIds = await stripeAdapter.searchCustomerIdsByEmail('nobody@internxt.com');

      expect(customerIds).toStrictEqual([]);
    });
  });

  describe('Customer tax details', () => {
    test('When the customer exists, then whether it is tax exempt, its tax ids and its address are returned', async () => {
      const retrieveSpy = jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue(
        stripeCustomer({
          tax_exempt: 'reverse',
          tax_ids: { data: [{ value: 'ESB12345678' }] } as Stripe.ApiList<Stripe.TaxId>,
        }) as Stripe.Response<Stripe.Customer>,
      );

      const taxDetails = await stripeAdapter.getCustomerTaxDetails('cus_internxt');

      expect(retrieveSpy).toHaveBeenCalledWith('cus_internxt', { expand: ['tax_ids'] });
      expect(taxDetails).toStrictEqual({
        isTaxExempt: true,
        taxIds: ['ESB12345678'],
        address: mappedCustomer.address,
      });
    });

    test('When the customer has no email, then its tax details are still returned', async () => {
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(stripeCustomer({ email: null }) as Stripe.Response<Stripe.Customer>);

      const taxDetails = await stripeAdapter.getCustomerTaxDetails('cus_internxt');

      expect(taxDetails?.address?.country).toBe('ES');
    });

    test('When the customer was deleted, then there are no tax details', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue({ id: 'cus_internxt', deleted: true } as any);

      const taxDetails = await stripeAdapter.getCustomerTaxDetails('cus_internxt');

      expect(taxDetails).toBeNull();
    });
  });

  describe('Customer tax ids', () => {
    test('When listing the tax ids of a customer, then their values are returned', async () => {
      jest
        .spyOn(stripe.customers, 'listTaxIds')
        .mockResolvedValue({ data: [{ value: 'ESB12345678' }, { value: 'EU123' }] } as any);

      const taxIds = await stripeAdapter.listTaxIds('cus_internxt');

      expect(taxIds).toStrictEqual(['ESB12345678', 'EU123']);
    });

    test('When adding a tax id, then Stripe stores it with its type', async () => {
      const createSpy = jest.spyOn(stripe.customers, 'createTaxId').mockResolvedValue({} as any);

      await stripeAdapter.createTaxId('cus_internxt', { type: 'es_cif', value: 'ESB12345678' });

      expect(createSpy).toHaveBeenCalledWith('cus_internxt', { type: 'es_cif', value: 'ESB12345678' });
    });

    test('When Stripe rejects the tax id as invalid, then an invalid tax id error is thrown', async () => {
      jest.spyOn(stripe.customers, 'createTaxId').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          code: 'tax_id_invalid',
          message: 'Invalid value for es_cif.',
        }),
      );

      await expect(stripeAdapter.createTaxId('cus_internxt', { type: 'es_cif', value: '123' })).rejects.toThrow(
        InvalidTaxIdError,
      );
    });

    test('When Stripe fails for another reason, then the error is not hidden', async () => {
      const rateLimitError = new Stripe.errors.StripeRateLimitError({ type: 'rate_limit_error', message: 'Too many' });
      jest.spyOn(stripe.customers, 'createTaxId').mockRejectedValue(rateLimitError);

      await expect(stripeAdapter.createTaxId('cus_internxt', { type: 'es_cif', value: '123' })).rejects.toBe(
        rateLimitError,
      );
    });
  });

  describe('Get a payment confirmation token', () => {
    test('When the token exists, then it is returned with its creation, expiration and usage', async () => {
      const stripeConfirmationToken = getConfirmationToken({
        created: 1_700_000_000,
        expires_at: 1_700_043_200,
        payment_intent: 'pi_123',
      });
      jest
        .spyOn(stripe.confirmationTokens, 'retrieve')
        .mockResolvedValue(stripeConfirmationToken as Stripe.Response<Stripe.ConfirmationToken>);

      const confirmationToken = await stripeAdapter.getConfirmationToken(stripeConfirmationToken.id);

      expect(confirmationToken).toStrictEqual(
        new ConfirmationToken({
          id: stripeConfirmationToken.id,
          createdAt: new Date(1_700_000_000_000),
          expiresAt: new Date(1_700_043_200_000),
          isAlreadyUsed: true,
        }),
      );
    });

    test('When Stripe does not know the token, then an error indicating it is invalid is thrown', async () => {
      jest.spyOn(stripe.confirmationTokens, 'retrieve').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          code: 'resource_missing',
          message: 'No such confirmationtoken',
        }),
      );

      await expect(stripeAdapter.getConfirmationToken('ctoken_unknown')).rejects.toThrow(InvalidConfirmationTokenError);
    });

    test('When Stripe fails for another reason, then the error is not hidden', async () => {
      const stripeOutage = new Stripe.errors.StripeAPIError({ type: 'api_error', message: 'Stripe is down' });
      jest.spyOn(stripe.confirmationTokens, 'retrieve').mockRejectedValue(stripeOutage);

      await expect(stripeAdapter.getConfirmationToken('ctoken_123')).rejects.toBe(stripeOutage);
    });
  });

  describe('Payment methods', () => {
    test('When retrieving a payment method, then its id and billing address are returned as plain data', async () => {
      jest
        .spyOn(stripe.paymentMethods, 'retrieve')
        .mockResolvedValue(getPaymentMethod({ id: 'pm_card' }) as Stripe.Response<Stripe.PaymentMethod>);

      const paymentMethod = await stripeAdapter.retrievePaymentMethod('pm_card');

      expect(paymentMethod).toStrictEqual({
        id: 'pm_card',
        address: {
          line1: '1234 Fake Street',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          postalCode: '94102',
        },
      });
    });

    test('When attaching a payment method to a customer, then the attached payment method and its customer are returned', async () => {
      const attachSpy = jest
        .spyOn(stripe.paymentMethods, 'attach')
        .mockResolvedValue(
          getPaymentMethod({ id: 'pm_card', customer: 'cus_internxt' }) as Stripe.Response<Stripe.PaymentMethod>,
        );

      const attached = await stripeAdapter.attachPaymentMethod('pm_card', 'cus_internxt');

      expect(attachSpy).toHaveBeenCalledWith('pm_card', { customer: 'cus_internxt' });
      expect(attached).toStrictEqual({ id: 'pm_card', customerId: 'cus_internxt' });
    });

    test('When listing the payment methods of a customer, then they are returned as Stripe sends them', async () => {
      const card = getPaymentMethod({ id: 'pm_card' });
      jest.spyOn(stripe.paymentMethods, 'list').mockResolvedValue({ data: [card] } as any);

      const paymentMethods = await stripeAdapter.listPaymentMethods('cus_internxt');

      expect(paymentMethods).toStrictEqual([card]);
    });

    test('When the customer has a default payment method, then it is returned as Stripe sends it', async () => {
      const card = getPaymentMethod({ id: 'pm_card' });
      const retrieveSpy = jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue(
        stripeCustomer({
          invoice_settings: { default_payment_method: card } as Stripe.Customer.InvoiceSettings,
        }) as Stripe.Response<Stripe.Customer>,
      );

      const defaultPaymentMethod = await stripeAdapter.getCustomerDefaultPaymentMethod('cus_internxt');

      expect(retrieveSpy).toHaveBeenCalledWith('cus_internxt', {
        expand: ['default_source', 'invoice_settings.default_payment_method'],
      });
      expect(defaultPaymentMethod).toStrictEqual(card);
    });

    test('When the customer only has a legacy default source, then that source is returned', async () => {
      const legacyCard = { id: 'card_legacy', object: 'card' } as Stripe.Card;
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(stripeCustomer({ default_source: legacyCard }) as Stripe.Response<Stripe.Customer>);

      const defaultPaymentMethod = await stripeAdapter.getCustomerDefaultPaymentMethod('cus_internxt');

      expect(defaultPaymentMethod).toStrictEqual(legacyCard);
    });

    test('When the customer was deleted, then there is no default payment method', async () => {
      jest.spyOn(stripe.customers, 'retrieve').mockResolvedValue({ id: 'cus_internxt', deleted: true } as any);

      const defaultPaymentMethod = await stripeAdapter.getCustomerDefaultPaymentMethod('cus_internxt');

      expect(defaultPaymentMethod).toBeNull();
    });
  });

  describe('Get prices', () => {
    test('When getting all available prices, then all prices are returned with the correct data', async () => {
      const stripePrice = getPrice({
        metadata: { show: '1', maxSpaceBytes: '107374182400', type: 'individual', annualCommitment: 'false' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 999,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('999'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'search').mockResolvedValue({
        data: [stripePrice],
      } as any);

      const prices = await stripeAdapter.getPrices('eur');

      expect(prices).toHaveLength(1);
      expect(prices[0]).toStrictEqual(
        Price.toDomain({
          id: stripePrice.id,
          productId: 'prod_test',
          bytes: Number(stripePrice.metadata.maxSpaceBytes),
          interval: 'year',
          commitmentPlan: false,
          recurring: true,
          amount: 999,
          currency: stripePrice.currency,
          decimalAmount: 9.99,
          type: UserType.Individual,
        }),
      );
    });

    test('When getting all available prices for a business plan, then the seat limits are included', async () => {
      const stripePrice = getPrice({
        metadata: {
          show: '1',
          maxSpaceBytes: '107374182400',
          type: 'business',
          annualCommitment: 'false',
          minimumSeats: '1',
          maximumSeats: '10',
        },
        recurring: {
          interval: 'month',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_business' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 2000,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('2000'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'search').mockResolvedValue({
        data: [stripePrice],
      } as any);

      const prices = await stripeAdapter.getPrices('eur');

      expect(prices[0].type).toBe(UserType.Business);
      expect(prices[0].minimumSeats).toBe(1);
      expect(prices[0].maximumSeats).toBe(10);
    });
  });

  describe('Get price by ID', () => {
    test('When getting a price by its ID, then the price is returned with the correct data', async () => {
      const stripePrice = getPrice({
        metadata: { maxSpaceBytes: '107374182400', type: 'individual', annualCommitment: 'false' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 999,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('999'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripeAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price).toStrictEqual(
        Price.toDomain({
          id: stripePrice.id,
          productId: 'prod_test',
          bytes: Number(stripePrice.metadata.maxSpaceBytes),
          interval: 'year',
          commitmentPlan: false,
          recurring: true,
          amount: 999,
          currency: stripePrice.currency,
          decimalAmount: 9.99,
          type: UserType.Individual,
        }),
      );
    });

    test('When getting a business price by its ID, then the seat limits are included', async () => {
      const stripePrice = getPrice({
        metadata: {
          bytes: '107374182400',
          type: 'business',
          annualCommitment: 'false',
          minimumSeats: '1',
          maximumSeats: '10',
        },
        recurring: {
          interval: 'year',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_business' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 5000,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('5000'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripeAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.type).toBe(UserType.Business);
      expect(price.minimumSeats).toBe(1);
      expect(price.maximumSeats).toBe(10);
    });

    test('When the price has an annual commitment, then the price is returned indicating that', async () => {
      const stripePrice = getPrice({
        metadata: { bytes: '107374182400', type: 'individual', annualCommitment: 'true' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 999,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('999'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripeAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.isCommitmentPlan).toBeTruthy();
    });

    test('When the price is a business plan, then the price is returned indicating that', async () => {
      const stripePrice = getPrice({
        metadata: { bytes: '107374182400', type: 'business' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 999,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('999'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripeAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.isBusinessPlan).toBeTruthy();
    });

    test('When the price is a one-time payment, then the interval is lifetime', async () => {
      const stripePrice = getPrice({
        metadata: { bytes: '107374182400', type: 'individual' },
        recurring: null,
        type: 'one_time',
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: {
            unit_amount: 999,
            tax_behavior: 'exclusive',
            custom_unit_amount: null,
            unit_amount_decimal: Stripe.Decimal.from('999'),
          },
        },
      });

      jest.spyOn(stripe.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripeAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.interval).toBe('lifetime');
    });
  });

  describe('Updating a subscription', () => {
    test('When updating a subscription, then the subscription is updated and mapped to a subscription entity', async () => {
      const stripeSubscription = getCreatedSubscription({ status: 'active', trial_end: null });

      const updateSpy = jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(stripeSubscription as any);

      const params = { cancel_at: 1800000000 };
      const subscription = await stripeAdapter.updateSubscription(stripeSubscription.id, params);

      expect(updateSpy).toHaveBeenCalledWith(stripeSubscription.id, params);
      expect(subscription).toStrictEqual(
        Subscription.toDomain({
          id: stripeSubscription.id,
          customer: stripeSubscription.customer as string,
          status: stripeSubscription.status as SubscriptionStatus,
          priceId: stripeSubscription.items.data[0].price.id,
          currentPeriodEnd: stripeSubscription.items.data[0].current_period_end,
          metadata: stripeSubscription.metadata,
          startDate: stripeSubscription.start_date,
        }),
      );
    });

    test('When updating a trialing subscription, then the entity reflects the trial state', async () => {
      const trialEnd = 1800000000;
      const stripeSubscription = getCreatedSubscription({ status: 'trialing', trial_end: trialEnd });

      jest.spyOn(stripe.subscriptions, 'update').mockResolvedValue(stripeSubscription as any);

      const subscription = await stripeAdapter.updateSubscription(stripeSubscription.id, {});

      expect(subscription.isTrialing).toBeTruthy();
      expect(subscription.trialEnd).toBe(trialEnd);
    });
  });

  describe('Getting a subscription', () => {
    test('When getting a subscription, then it is retrieved and mapped to a subscription entity', async () => {
      const stripeSubscription = getCreatedSubscription({ status: 'active', trial_end: null });

      const retrieveSpy = jest.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue(stripeSubscription as any);

      const subscription = await stripeAdapter.getSubscription(stripeSubscription.id);

      expect(retrieveSpy).toHaveBeenCalledWith(stripeSubscription.id, { expand: ['plan.product'] });
      expect(subscription).toStrictEqual(
        Subscription.toDomain({
          id: stripeSubscription.id,
          customer: stripeSubscription.customer as string,
          status: stripeSubscription.status as SubscriptionStatus,
          currentPeriodEnd: stripeSubscription.items.data[0].current_period_end,
          priceId: stripeSubscription.items.data[0].price.id,
          startDate: stripeSubscription.start_date,
          metadata: stripeSubscription.metadata,
          trialEnd: undefined,
          paymentMethod: (stripeSubscription.default_payment_method as Stripe.PaymentMethod).id as string,
        }),
      );
    });

    test('When getting a trialing subscription, then the entity reflects the trial state', async () => {
      const trialEnd = 1800000000;
      const stripeSubscription = getCreatedSubscription({ status: 'trialing', trial_end: trialEnd });

      jest.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue(stripeSubscription as any);

      const subscription = await stripeAdapter.getSubscription(stripeSubscription.id);

      expect(subscription.isTrialing).toBeTruthy();
      expect(subscription.trialEnd).toBe(trialEnd);
    });
  });

  describe('Creating an invoice', () => {
    test('When creating an invoice, then the invoice is created and the entity is mapped and returned', async () => {
      const mockedInvoice = getInvoice({ confirmation_secret: { client_secret: 'pi_secret', type: 'payment_intent' } });

      jest.spyOn(stripe.invoices, 'create').mockResolvedValue(mockedInvoice as any);

      const invoice = await stripeAdapter.createInvoice({
        customer: mockedInvoice.customer as string,
      });

      expect(invoice).toStrictEqual(
        Invoice.toDomain({
          id: mockedInvoice.id as string,
          clientSecretId: 'pi_secret',
          status: mockedInvoice.status as InvoiceStatus,
        }),
      );
    });
  });

  describe('Finalizing an invoice', () => {
    test('When finalizing an invoice, then the invoice is finalized and the entity is mapped and returned', async () => {
      const mockedInvoice = getInvoice({ confirmation_secret: { client_secret: 'pi_secret', type: 'payment_intent' } });

      jest.spyOn(stripe.invoices, 'finalizeInvoice').mockResolvedValue(mockedInvoice as any);

      const invoice = await stripeAdapter.finalizeInvoice(mockedInvoice.id as string);

      expect(invoice).toStrictEqual(
        Invoice.toDomain({
          id: mockedInvoice.id as string,
          clientSecretId: 'pi_secret',
          status: mockedInvoice.status as InvoiceStatus,
        }),
      );
    });
  });

  describe('Adding invoice items', () => {
    test('When adding invoice items, then the invoice items are added and the entity is mapped and returned', async () => {
      const mockedInvoiceItems = getInvoiceItems();

      jest.spyOn(stripe.invoiceItems, 'create').mockResolvedValue({
        ...mockedInvoiceItems,
        lastResponse: {} as any,
      });

      const invoice = await stripeAdapter.addInvoiceItems(
        mockedInvoiceItems.id,
        mockedInvoiceItems.customer as string,
        {},
      );

      expect(invoice).toStrictEqual(
        InvoiceItems.toDomain({
          id: mockedInvoiceItems.id,
        }),
      );
    });
  });

  describe('Tax registrations', () => {
    const asAsyncIterable = (registrations: Partial<Stripe.Tax.Registration>[]) => ({
      async *[Symbol.asyncIterator]() {
        for (const registration of registrations) {
          yield registration as Stripe.Tax.Registration;
        }
      },
    });

    afterEach(() => {
      stripeAdapter.taxRegistrations = new Set<string>();
    });

    test('When a standard registration is synced, then only its country is stored', async () => {
      jest
        .spyOn(stripe.tax.registrations, 'list')
        .mockReturnValue(asAsyncIterable([{ country: 'ES', country_options: { es: { type: 'standard' } } }]) as any);

      await stripeAdapter.syncTaxRegistrations();

      expect(stripeAdapter.taxRegistrations.has('ES')).toBe(true);
      expect(stripeAdapter.taxRegistrations.has('FR')).toBe(false);
    });

    test('When an OSS union registration is synced, then the whole EU is stored', async () => {
      jest
        .spyOn(stripe.tax.registrations, 'list')
        .mockReturnValue(asAsyncIterable([{ country: 'ES', country_options: { es: { type: 'oss_union' } } }]) as any);

      await stripeAdapter.syncTaxRegistrations();

      EU_COUNTRIES.forEach((country) => {
        expect(stripeAdapter.taxRegistrations.has(country)).toBe(true);
      });
    });

    test('When registrations have no country, then they are ignored', async () => {
      jest
        .spyOn(stripe.tax.registrations, 'list')
        .mockReturnValue(asAsyncIterable([{ country: undefined, country_options: {} }]) as any);

      await stripeAdapter.syncTaxRegistrations();

      expect(stripeAdapter.taxRegistrations.size).toBe(0);
    });
  });

  describe('Should calculate taxes', () => {
    afterEach(() => {
      stripeAdapter.taxRegistrations = new Set<string>();
    });

    test('When the country is registered, then it returns true (case-insensitive)', () => {
      stripeAdapter.taxRegistrations = new Set(['ES']);

      expect(stripeAdapter.shouldCalculateTax('ES')).toBe(true);
      expect(stripeAdapter.shouldCalculateTax('es')).toBe(true);
    });

    test('When the country is not registered, then it returns false', () => {
      stripeAdapter.taxRegistrations = new Set(['ES']);

      expect(stripeAdapter.shouldCalculateTax('CN')).toBe(false);
    });

    test('When the country is missing, then it returns false', () => {
      stripeAdapter.taxRegistrations = new Set(['ES']);

      expect(stripeAdapter.shouldCalculateTax(undefined)).toBe(false);
      expect(stripeAdapter.shouldCalculateTax(null)).toBe(false);
    });
  });

  describe('Should calculate taxes for customer', () => {
    afterEach(() => {
      stripeAdapter.taxRegistrations = new Set<string>();
    });

    test("When the customer's country is registered, then it returns true", async () => {
      stripeAdapter.taxRegistrations = new Set(['ES']);
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(getCustomer({ address: { country: 'ES' } as any }) as Stripe.Response<Stripe.Customer>);

      await expect(stripeAdapter.shouldCalculateTaxForCustomer('cus_test')).resolves.toBe(true);
    });

    test("When the customer's country is not registered, then it returns false", async () => {
      stripeAdapter.taxRegistrations = new Set(['ES']);
      jest
        .spyOn(stripe.customers, 'retrieve')
        .mockResolvedValue(getCustomer({ address: { country: 'CN' } as any }) as Stripe.Response<Stripe.Customer>);

      await expect(stripeAdapter.shouldCalculateTaxForCustomer('cus_test')).resolves.toBe(false);
    });
  });
});
