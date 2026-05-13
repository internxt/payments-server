import { getCustomer, getPaymentMethod, getPrice } from '../../fixtures';
import { stripePaymentsAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import Stripe from 'stripe';
import { Customer } from '../../../../src/infrastructure/domain/entities/customer';
import { UserNotFoundError } from '../../../../src/errors/PaymentErrors';
import { PaymentMethod } from '../../../../src/infrastructure/domain/entities/paymentMethod';
import { Price } from '../../../../src/infrastructure/domain/entities/price';
import { UserType } from '../../../../src/core/users/User';
import { PRODUCT_BASE } from '../../fixtures/stripe-base.generated';

describe('Stripe Adapter', () => {
  describe('Create customer', () => {
    test('When creating a customer, then the customer is created and the correct data is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'create')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const metadata = { referralCode: 'ABC123' };

      const createdCustomer = await stripePaymentsAdapter.createCustomer({
        email: mockedCustomer.email as string,
        name: mockedCustomer.name as string,
        address: {
          line1: mockedCustomer.address?.line1 ?? '',
          line2: mockedCustomer.address?.line2 ?? '',
          city: mockedCustomer.address?.city ?? '',
          state: mockedCustomer.address?.state ?? '',
          country: mockedCustomer.address?.country ?? '',
          postalCode: mockedCustomer.address?.postal_code ?? '',
        },
        metadata,
      });

      expect(createdCustomer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });
  });

  describe('Update customer', () => {
    test('When updating a customer, then the customer is updated and the correct data is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'update')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const updatedCustomer = await stripePaymentsAdapter.updateCustomer(mockedCustomer.id, {
        email: mockedCustomer.email as string,
        name: mockedCustomer.name as string,
        address: {
          line1: mockedCustomer.address?.line1 ?? '',
          line2: mockedCustomer.address?.line2 ?? '',
          city: mockedCustomer.address?.city ?? '',
          state: mockedCustomer.address?.state ?? '',
          country: mockedCustomer.address?.country ?? '',
          postalCode: mockedCustomer.address?.postal_code ?? '',
        },
      });

      expect(updatedCustomer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });

    test('When address is not provided, then the existing address should be preserved', async () => {
      const originalAddress = {
        postal_code: '08001',
        country: 'ES',
        city: 'Barcelona',
        line1: 'Carrer Major 1',
        line2: 'Piso 2',
        state: 'Catalunya',
      };

      const initialCustomer = getCustomer({
        name: 'Original Name',
        email: 'original@internxt.com',
        address: originalAddress,
      });

      const updatedCustomer = getCustomer({
        id: initialCustomer.id,
        name: 'Updated Name',
        email: 'original@internxt.com',
        address: originalAddress,
      });

      const updateSpy = jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'update')
        .mockResolvedValue(updatedCustomer as Stripe.Response<Stripe.Customer>);

      const result = await stripePaymentsAdapter.updateCustomer(initialCustomer.id, {
        name: 'Updated Name',
      });

      expect(updateSpy).toHaveBeenCalledWith(initialCustomer.id, {
        name: 'Updated Name',
      });
      expect(updateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({ address: expect.anything() }),
      );

      expect(result.name).toBe('Updated Name');
      expect(result.address).toStrictEqual({
        line1: originalAddress.line1,
        line2: originalAddress.line2,
        city: originalAddress.city,
        state: originalAddress.state,
        country: originalAddress.country,
        postalCode: originalAddress.postal_code,
      });
    });
  });

  describe('Get customer', () => {
    test('When getting a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'retrieve')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const customer = await stripePaymentsAdapter.getCustomer(mockedCustomer.id);

      expect(customer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });

    test('When the customer does not exists, then an error indicating so is thrown', async () => {
      const mockedCustomer = {
        deleted: true,
      };
      const mockedError = new UserNotFoundError();

      jest.spyOn(stripePaymentsAdapter.provider.customers, 'retrieve').mockResolvedValue(mockedCustomer as any);

      await expect(stripePaymentsAdapter.getCustomer('')).rejects.toThrow(mockedError);
    });
  });

  describe('Search customer', () => {
    test('When searching a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest.spyOn(stripePaymentsAdapter.provider.customers, 'search').mockResolvedValue({
        data: [mockedCustomer],
      } as any);

      const customer = await stripePaymentsAdapter.searchCustomer(mockedCustomer.email as string);

      expect(customer).toStrictEqual([Customer.toDomain(mockedCustomer)]);
    });

    test('When searching a customer and there is no match, then an error indicating so is thrown', async () => {
      const mockedError = new UserNotFoundError();
      const mockedCustomer = getCustomer();

      jest.spyOn(stripePaymentsAdapter.provider.customers, 'search').mockResolvedValue({
        data: [],
        total_count: 0,
      } as any);

      await expect(stripePaymentsAdapter.searchCustomer(mockedCustomer.email as string)).rejects.toThrow(mockedError);
    });
  });

  describe('Get Payment methods', () => {
    test('When retrieving a payment method, then the payment method is returned', async () => {
      const mockedPaymentMethod = getPaymentMethod();

      jest
        .spyOn(stripePaymentsAdapter.provider.paymentMethods, 'retrieve')
        .mockResolvedValue(mockedPaymentMethod as Stripe.Response<Stripe.PaymentMethod>);

      const paymentMethod = await stripePaymentsAdapter.retrievePaymentMethod(mockedPaymentMethod.id);

      expect(paymentMethod).toStrictEqual(PaymentMethod.toDomain(mockedPaymentMethod));
    });
  });

  describe('Get prices', () => {
    test('When getting all available prices, then all prices are returned with the correct data', async () => {
      const stripePrice = getPrice({
        metadata: { show: '1', maxSpaceBytes: '107374182400', type: 'individual', annualCommitment: 'false' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 999, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '999' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'search').mockResolvedValue({
        data: [stripePrice],
      } as any);

      const prices = await stripePaymentsAdapter.getPrices('eur');

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
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_business' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 2000, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '2000' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'search').mockResolvedValue({
        data: [stripePrice],
      } as any);

      const prices = await stripePaymentsAdapter.getPrices('eur');

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
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 999, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '999' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripePaymentsAdapter.getPriceById(stripePrice.id, 'eur');

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
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_business' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 5000, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '5000' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripePaymentsAdapter.getPriceById(stripePrice.id, 'eur');

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
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 999, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '999' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripePaymentsAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.isCommitmentPlan).toBeTruthy();
    });

    test('When the price is a business plan, then the price is returned indicating that', async () => {
      const stripePrice = getPrice({
        metadata: { bytes: '107374182400', type: 'business' },
        recurring: {
          interval: 'year',
          interval_count: 1,
          aggregate_usage: null,
          meter: null,
          usage_type: 'licensed',
          trial_period_days: null,
        },
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 999, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '999' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripePaymentsAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.isBusinessPlan).toBeTruthy();
    });

    test('When the price is a one-time payment, then the interval is lifetime', async () => {
      const stripePrice = getPrice({
        metadata: { bytes: '107374182400', type: 'individual' },
        recurring: null,
        type: 'one_time',
        product: { ...PRODUCT_BASE, id: 'prod_test' } as Stripe.Product,
        currency_options: {
          eur: { unit_amount: 999, tax_behavior: 'exclusive', custom_unit_amount: null, unit_amount_decimal: '999' },
        },
      });

      jest.spyOn(stripePaymentsAdapter.provider.prices, 'retrieve').mockResolvedValue(stripePrice as any);

      const price = await stripePaymentsAdapter.getPriceById(stripePrice.id, 'eur');

      expect(price.interval).toBe('lifetime');
    });
  });
});
