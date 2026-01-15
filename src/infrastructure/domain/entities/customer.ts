import Stripe from 'stripe';

interface CustomerAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export class Customer {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly address: CustomerAddress,
  ) {}

  static toDomain(stripeCustomer: Stripe.Customer): Customer {
    if (!stripeCustomer.name) {
      throw new Error('Customer name is required');
    }

    if (!stripeCustomer.email) {
      throw new Error('Customer email is required');
    }

    if (!stripeCustomer.address) {
      throw new Error('Customer address is required');
    }

    return new Customer(stripeCustomer.id, stripeCustomer.name, stripeCustomer.email, {
      line1: stripeCustomer.address.line1 ?? '',
      line2: stripeCustomer.address.line2 ?? '',
      city: stripeCustomer.address.city ?? '',
      state: stripeCustomer.address.state ?? '',
      country: stripeCustomer.address.country ?? '',
      postalCode: stripeCustomer.address.postal_code ?? '',
    });
  }

  getCustomerId(): string {
    return this.id;
  }

  getEmail(): string {
    return this.email;
  }

  getAddress(): CustomerAddress {
    return this.address;
  }
}
