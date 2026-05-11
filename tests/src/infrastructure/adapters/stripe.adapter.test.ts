import { getCustomer, getPaymentMethod } from '../../fixtures';
import { stripeAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import Stripe from 'stripe';
import { Customer } from '../../../../src/infrastructure/domain/entities/customer';
import { UserNotFoundError } from '../../../../src/errors/PaymentErrors';
import { PaymentMethod } from '../../../../src/infrastructure/domain/entities/paymentMethod';

describe('Stripe Adapter', () => {
  describe('Create customer', () => {
    test('When creating a customer, then the customer is created and the correct data is returned', async () => {
      const mockedCustomer = getCustomer();

      jest
        .spyOn(stripeAdapter.provider.customers, 'create')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const metadata = { referralCode: 'ABC123' };

      const createdCustomer = await stripeAdapter.createCustomer({
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
        .spyOn(stripeAdapter.provider.customers, 'update')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const updatedCustomer = await stripeAdapter.updateCustomer(mockedCustomer.id, {
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
        .spyOn(stripeAdapter.provider.customers, 'update')
        .mockResolvedValue(updatedCustomer as Stripe.Response<Stripe.Customer>);

      const result = await stripeAdapter.updateCustomer(initialCustomer.id, {
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
        .spyOn(stripeAdapter.provider.customers, 'retrieve')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);

      const customer = await stripeAdapter.getCustomer(mockedCustomer.id);

      expect(customer).toStrictEqual(Customer.toDomain(mockedCustomer));
    });

    test('When the customer does not exists, then an error indicating so is thrown', async () => {
      const mockedCustomer = {
        deleted: true,
      };
      const mockedError = new UserNotFoundError();

      jest.spyOn(stripeAdapter.provider.customers, 'retrieve').mockResolvedValue(mockedCustomer as any);

      await expect(stripeAdapter.getCustomer('')).rejects.toThrow(mockedError);
    });
  });

  describe('Search customer', () => {
    test('When searching a customer, then the customer is returned', async () => {
      const mockedCustomer = getCustomer();

      jest.spyOn(stripeAdapter.provider.customers, 'search').mockResolvedValue({
        data: [mockedCustomer],
      } as any);

      const customer = await stripeAdapter.searchCustomer(mockedCustomer.email as string);

      expect(customer).toStrictEqual([Customer.toDomain(mockedCustomer)]);
    });

    test('When searching a customer and there is no match, then an error indicating so is thrown', async () => {
      const mockedError = new UserNotFoundError();
      const mockedCustomer = getCustomer();

      jest.spyOn(stripeAdapter.provider.customers, 'search').mockResolvedValue({
        data: [],
        total_count: 0,
      } as any);

      await expect(stripeAdapter.searchCustomer(mockedCustomer.email as string)).rejects.toThrow(mockedError);
    });
  });

  describe('Get Payment methods', () => {
    test('When retrieving a payment method, then the payment method is returned', async () => {
      const mockedPaymentMethod = getPaymentMethod();

      jest
        .spyOn(stripeAdapter.provider.paymentMethods, 'retrieve')
        .mockResolvedValue(mockedPaymentMethod as Stripe.Response<Stripe.PaymentMethod>);

      const paymentMethod = await stripeAdapter.retrievePaymentMethod(mockedPaymentMethod.id);

      expect(paymentMethod).toStrictEqual(PaymentMethod.toDomain(mockedPaymentMethod));
    });
  });
});
