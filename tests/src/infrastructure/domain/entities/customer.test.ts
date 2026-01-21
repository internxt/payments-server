import { getCustomer } from '../../../fixtures';
import { Customer } from '../../../../../src/infrastructure/domain/entities/customer';
import { BadRequestError } from '../../../../../src/errors/Errors';
import { DEFAULT_CUSTOMER_NAME } from '../../../../../src/constants';

describe('Customer entity', () => {
  const mockedCustomer = getCustomer();

  test('When converting the customer to domain, then the customer is created successfully', () => {
    const customer = Customer.toDomain(mockedCustomer);

    expect(customer).toBeInstanceOf(Customer);
    expect(customer).toMatchObject({
      id: mockedCustomer.id,
      name: mockedCustomer.name,
      email: mockedCustomer.email,
      address: {
        line1: mockedCustomer.address?.line1,
        line2: mockedCustomer.address?.line2,
        city: mockedCustomer.address?.city,
        state: mockedCustomer.address?.state,
        country: mockedCustomer.address?.country,
        postalCode: mockedCustomer.address?.postal_code,
      },
    });
  });

  test('When requesting the customer id, then the customer id is returned', () => {
    const customer = Customer.toDomain(mockedCustomer);

    expect(customer.getCustomerId()).toStrictEqual(mockedCustomer.id);
  });

  test('When requesting the customer email, then the customer email is returned', () => {
    const customer = Customer.toDomain(mockedCustomer);

    expect(customer.getEmail()).toStrictEqual(mockedCustomer.email);
  });

  test('When requesting the customer address, then the customer address is returned', () => {
    const customer = Customer.toDomain(mockedCustomer);

    expect(customer.getAddress()).toStrictEqual({
      line1: mockedCustomer.address?.line1,
      line2: mockedCustomer.address?.line2,
      city: mockedCustomer.address?.city,
      state: mockedCustomer.address?.state,
      country: mockedCustomer.address?.country,
      postalCode: mockedCustomer.address?.postal_code,
    });
  });

  test('When converting a customer without name, then the default name is used', () => {
    const customerWithoutName = { ...mockedCustomer, name: null };

    const customer = Customer.toDomain(customerWithoutName);

    expect(customer.name).toStrictEqual(DEFAULT_CUSTOMER_NAME);
  });

  test('When converting a customer without email, then an error is thrown', () => {
    const badRequestNotFoundError = new BadRequestError('Customer email is required');
    const customerWithoutEmail = { ...mockedCustomer, email: null };

    expect(() => Customer.toDomain(customerWithoutEmail)).toThrow(badRequestNotFoundError);
  });
});
