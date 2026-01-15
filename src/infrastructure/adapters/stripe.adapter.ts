import Stripe from 'stripe';

import { UserNotFoundError } from '../../errors/PaymentErrors';
import { PaymentsAdapter } from '../domain/ports/payments.adapter';
import { Customer, CreateCustomerParams } from '../domain/entities/customer';
import envVariablesConfig from '../../config';

export class StripePaymentsAdapter implements PaymentsAdapter {
  private readonly provider: Stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  getInstance(): Stripe {
    return this.provider;
  }

  async createCustomer(params: CreateCustomerParams): Promise<Customer> {
    const stripeCustomer = await this.provider.customers.create(this.toStripeCustomerParams(params));

    return Customer.toDomain(stripeCustomer);
  }

  async updateCustomer(customerId: Customer['id'], params: Partial<CreateCustomerParams>): Promise<Customer> {
    const updatedCustomer = await this.provider.customers.update(customerId, this.toStripeCustomerParams(params));

    return Customer.toDomain(updatedCustomer);
  }

  async getCustomer(customerId: Customer['id']): Promise<Customer> {
    const stripeCustomer = await this.provider.customers.retrieve(customerId);

    if (stripeCustomer.deleted) {
      throw new UserNotFoundError();
    }

    return Customer.toDomain(stripeCustomer);
  }

  async searchCustomer(email: Customer['email']): Promise<Customer[]> {
    const customers = await this.provider.customers.search({
      query: `email:'${email}'`,
      expand: ['total_count'],
    });

    if (customers?.total_count === 0) {
      throw new UserNotFoundError();
    }

    return customers.data.map((customer) => Customer.toDomain(customer));
  }

  private toStripeCustomerParams(params: Partial<CreateCustomerParams>): Stripe.CustomerCreateParams {
    return {
      ...(params.name && { name: params.name }),
      ...(params.email && { email: params.email }),
      ...(params.address && {
        address: {
          line1: params.address.line1,
          line2: params.address.line2,
          city: params.address.city,
          state: params.address.state,
          country: params.address.country,
          postal_code: params.address.postalCode,
        },
      }),
    };
  }
}

export const stripePaymentsAdapter = new StripePaymentsAdapter();
