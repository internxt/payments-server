import Stripe from 'stripe';
import { BadRequestError } from '../../../errors/Errors';
import { Address } from '../types';
import { CANCELLATION_TRIAL_REDEEMED_KEY, DEFAULT_CUSTOMER_NAME } from '../../../constants';

export interface CreateCustomerParams {
  name: string;
  email: string;
  address: Partial<Address>;
  metadata?: Record<string, string>;
}

export interface UpdateCustomerParams extends Partial<CreateCustomerParams> {
  phone?: string;
  tax?: {
    id: string;
    type: Stripe.TaxIdCreateParams.Type;
  };
}

export class Customer {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly address?: Address,
    public readonly phone?: string,
    public readonly metadata?: Record<string, string>,
  ) {}

  static toDomain(stripeCustomer: Stripe.Customer): Customer {
    const customerName = stripeCustomer.name ?? DEFAULT_CUSTOMER_NAME;

    if (!stripeCustomer.email) {
      throw new BadRequestError('Customer email is required');
    }

    return new Customer(
      stripeCustomer.id,
      customerName,
      stripeCustomer.email,
      {
        line1: stripeCustomer.address?.line1,
        line2: stripeCustomer.address?.line2,
        city: stripeCustomer.address?.city,
        state: stripeCustomer.address?.state,
        country: stripeCustomer.address?.country,
        postalCode: stripeCustomer.address?.postal_code,
      },
      stripeCustomer.phone ?? undefined,
      stripeCustomer.metadata,
    );
  }

  getCustomerId(): string {
    return this.id;
  }

  getEmail(): string {
    return this.email;
  }

  getAddress(): Address | undefined {
    return this.address;
  }

  get cancellationTrialRedeemed(): boolean {
    return this.metadata?.[CANCELLATION_TRIAL_REDEEMED_KEY] === 'true';
  }
}
