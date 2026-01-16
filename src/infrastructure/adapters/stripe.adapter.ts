import Stripe from 'stripe';

import { UserNotFoundError } from '../../errors/PaymentErrors';
import { PaymentsAdapter } from '../domain/ports/payments.adapter';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../domain/entities/customer';
import envVariablesConfig from '../../config';
import { PaymentMethod } from '../domain/entities/paymentMethod';

export class StripePaymentsAdapter implements PaymentsAdapter {
  private readonly provider: Stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  getInstance(): Stripe {
    return this.provider;
  }

  async createCustomer(params: Partial<CreateCustomerParams>): Promise<Customer> {
    const stripeCustomer = await this.provider.customers.create(this.toStripeCustomerParams(params));

    return Customer.toDomain(stripeCustomer);
  }

  async updateCustomer(customerId: Customer['id'], params: Partial<UpdateCustomerParams>): Promise<Customer> {
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

  async retrievePaymentMethod(paymentMethodId: PaymentMethod['id']): Promise<PaymentMethod> {
    const paymentMethods = await this.provider.paymentMethods.retrieve(paymentMethodId, {});
    return PaymentMethod.toDomain(paymentMethods);
  }

  private toStripeCustomerParams(params: Partial<UpdateCustomerParams>): Stripe.CustomerCreateParams {
    return {
      name: params.name,
      email: params.email,
      phone: params.phone,
      address: {
        line1: params.address?.line1 ?? undefined,
        line2: params.address?.line2 ?? undefined,
        city: params.address?.city ?? undefined,
        state: params.address?.state ?? undefined,
        country: params.address?.country ?? undefined,
        postal_code: params.address?.postalCode ?? undefined,
      },
    };
  }
}

export const stripePaymentsAdapter = new StripePaymentsAdapter();
