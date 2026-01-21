import { PaymentMethod } from '../../../../../src/infrastructure/domain/entities/paymentMethod';
import { getPaymentMethod } from '../../../fixtures';

describe('Payment method entity', () => {
  test('When creating a payment method, then it is created successfully', () => {
    const mockedPaymentMethod = getPaymentMethod();

    const paymentMethod = PaymentMethod.toDomain(mockedPaymentMethod);

    expect(paymentMethod.getId()).toStrictEqual(mockedPaymentMethod.id);
    expect(paymentMethod.getAddress()).toStrictEqual({
      line1: mockedPaymentMethod.billing_details.address?.line1,
      line2: mockedPaymentMethod.billing_details.address?.line2,
      city: mockedPaymentMethod.billing_details.address?.city,
      state: mockedPaymentMethod.billing_details.address?.state,
      country: mockedPaymentMethod.billing_details.address?.country,
      postalCode: mockedPaymentMethod.billing_details.address?.postal_code,
    });
  });

  test('When requesting the payment method id, then the payment method id is returned', () => {
    const mockedPaymentMethod = getPaymentMethod();

    const paymentMethod = PaymentMethod.toDomain(mockedPaymentMethod);

    expect(paymentMethod.getId()).toStrictEqual(mockedPaymentMethod.id);
  });

  test('When requesting the payment method address, then the payment method address is returned', () => {
    const mockedPaymentMethod = getPaymentMethod();

    const paymentMethod = PaymentMethod.toDomain(mockedPaymentMethod);

    expect(paymentMethod.getAddress()).toStrictEqual({
      line1: mockedPaymentMethod.billing_details.address?.line1,
      line2: mockedPaymentMethod.billing_details.address?.line2,
      city: mockedPaymentMethod.billing_details.address?.city,
      state: mockedPaymentMethod.billing_details.address?.state,
      country: mockedPaymentMethod.billing_details.address?.country,
      postalCode: mockedPaymentMethod.billing_details.address?.postal_code,
    });
  });
});
