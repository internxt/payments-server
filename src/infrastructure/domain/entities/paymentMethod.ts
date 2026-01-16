import Stripe from 'stripe';
import { Address } from '../types';

export class PaymentMethod {
  constructor(
    public readonly id: string,
    public readonly address?: Address,
  ) {}

  static toDomain(stripePaymentMethod: Stripe.PaymentMethod): PaymentMethod {
    return new PaymentMethod(stripePaymentMethod.id, {
      line1: stripePaymentMethod.billing_details.address?.line1,
      line2: stripePaymentMethod.billing_details.address?.line2,
      city: stripePaymentMethod.billing_details.address?.city,
      state: stripePaymentMethod.billing_details.address?.state,
      country: stripePaymentMethod.billing_details.address?.country,
      postalCode: stripePaymentMethod.billing_details.address?.postal_code,
    });
  }

  getId(): string {
    return this.id;
  }

  getAddress(): Address | undefined {
    return this.address;
  }
}
