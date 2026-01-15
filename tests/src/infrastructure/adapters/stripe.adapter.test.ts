import { getCustomer } from '../../fixtures';
import { stripePaymentsAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import Stripe from 'stripe';
import { Customer } from '../../../../src/infrastructure/domain/entities/customer';

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
  });

  describe('Search customer', () => {
    test('When searching a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest.spyOn(stripePaymentsAdapter.getInstance().customers, 'search').mockResolvedValue({
        data: [mockedCustomer],
      } as any);

      const customer = await stripePaymentsAdapter.searchCustomer({
        query: `email:${mockedCustomer.email}`,
      });

      expect(customer).toStrictEqual([Customer.toDomain(mockedCustomer)]);
    });
  });
});
