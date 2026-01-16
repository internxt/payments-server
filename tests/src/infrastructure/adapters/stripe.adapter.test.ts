import { getCustomer, getPaymentMethod } from '../../fixtures';
import { stripePaymentsAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import Stripe from 'stripe';
import { Customer } from '../../../../src/infrastructure/domain/entities/customer';
import { UserNotFoundError } from '../../../../src/errors/PaymentErrors';
import { PaymentMethod } from '../../../../src/infrastructure/domain/entities/paymentMethod';

describe('Stripe Adapter', () => {
  describe('Create customer', () => {
    test('When creating a customer, then the customer is created and the correct data is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.getInstance().customers, 'create')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

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
      });

      expect(createdCustomer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });
  });

  describe('Update customer', () => {
    test('When updating a customer, then the customer is updated and the correct data is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.getInstance().customers, 'update')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const updatedCustomer = await stripePaymentsAdapter.updateCustomer(mockedCustomer.id, {
        email: mockedCustomer.email as string,
        name: mockedCustomer.name as string,
      });

      expect(updatedCustomer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });
  });

  describe('Get customer', () => {
    test('When getting a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripePaymentsAdapter.getInstance().customers, 'retrieve')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const customer = await stripePaymentsAdapter.getCustomer(mockedCustomer.id);

      expect(customer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });

    test('When the customer does not exists, then an error indicating so is thrown', async () => {
      const mockedCustomer = {
        deleted: true,
      };
      const mockedError = new UserNotFoundError();

      jest.spyOn(stripePaymentsAdapter.getInstance().customers, 'retrieve').mockResolvedValue(mockedCustomer as any);

      await expect(stripePaymentsAdapter.getCustomer('')).rejects.toThrow(mockedError);
    });
  });

  describe('Search customer', () => {
    test('When searching a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest.spyOn(stripePaymentsAdapter.getInstance().customers, 'search').mockResolvedValue({
        data: [mockedCustomer],
      } as any);

      const customer = await stripePaymentsAdapter.searchCustomer(mockedCustomer.email as string);

      expect(customer).toStrictEqual([Customer.toDomain(mockedCustomer)]);
    });

    test('When searching a customer and there is no match, then an error indicating so is thrown', async () => {
      const mockedError = new UserNotFoundError();
      const mockedCustomer = getCustomer();

      jest.spyOn(stripePaymentsAdapter.getInstance().customers, 'search').mockResolvedValue({
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
        .spyOn(stripePaymentsAdapter.getInstance().paymentMethods, 'retrieve')
        .mockResolvedValue(mockedPaymentMethod as Stripe.Response<Stripe.PaymentMethod>);

      const paymentMethod = await stripePaymentsAdapter.retrievePaymentMethod(mockedPaymentMethod.id);

      expect(paymentMethod).toStrictEqual(PaymentMethod.toDomain(mockedPaymentMethod));
    });
  });
});
