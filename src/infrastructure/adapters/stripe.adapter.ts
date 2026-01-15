import Stripe from 'stripe';

import { UserNotFoundError } from '../../errors/PaymentErrors';
import { PaymentsAdapter } from '../domain/ports/payments.adapter';
import { Customer } from '../domain/entities/customer';
import envVariablesConfig from '../../config';

export class StripePaymentsAdapter implements PaymentsAdapter {
  private readonly provider: Stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  getInstance(): Stripe {
    return this.provider;
  }
  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Customer> {
    const stripeCustomer = await this.provider.customers.create(params);

    return Customer.toDomain(stripeCustomer);
  }

  async updateCustomer(customerId: string, params: Stripe.CustomerUpdateParams): Promise<Customer> {
    const updatedCustomer = await this.provider.customers.update(customerId, params);

    return Customer.toDomain(updatedCustomer);
  }

  async getCustomer(customerId: string): Promise<Customer> {
    const stripeCustomer = await this.provider.customers.retrieve(customerId);

    if (stripeCustomer.deleted) {
      throw new UserNotFoundError();
    }

    return Customer.toDomain(stripeCustomer);
  }

  async searchCustomer(params: Stripe.CustomerSearchParams): Promise<Customer[]> {
    const customers = await this.provider.customers.search({
      ...params,
      expand: ['total_count'],
    });

    if (customers?.total_count === 0) {
      throw new UserNotFoundError();
    }

    return customers.data.map((customer) => Customer.toDomain(customer));
  }
}

export const stripePaymentsAdapter = new StripePaymentsAdapter();
