import Stripe from 'stripe';

import { UserNotFoundError } from '../../errors/PaymentErrors';
import { PaymentsAdapter } from '../domain/ports/payments.adapter';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../domain/entities/customer';
import envVariablesConfig from '../../config';
import { PaymentMethod } from '../domain/entities/paymentMethod';

import { UserType } from '../../core/users/User';
import { Price, PriceInterval } from '../domain/entities/price';

export class StripePaymentsAdapter implements PaymentsAdapter {
  readonly provider: Stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

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

  async getPrices(currency: string = 'eur'): Promise<Price[]> {
    const prices = await this.provider.prices.search({
      query: `metadata["show"]:"1" active:"true" currency:"${currency}"`,
      expand: ['data.currency_options', 'data.product'],
      limit: 100,
    });

    return prices.data.map((price) => {
      const businessSeats = this.getBusinessSeats(price);

      return Price.toDomain({
        id: price.id,
        productId: (price.product as Stripe.Product).id,
        bytes: Number.parseInt(price.metadata.bytes),
        interval: this.getInterval(price.recurring!.interval),
        commitmentPlan: this.hasAnnualCommitment(price),
        recurring: price.type === 'recurring',
        amount: price.currency_options![currency].unit_amount as number,
        currency: price.currency,
        decimalAmount: (price.currency_options![currency].unit_amount as number) / 100,
        type: price.metadata.type === 'business' ? UserType.Business : UserType.Individual,
        ...businessSeats,
      });
    });
  }

  async getPriceById(priceId: Price['id'], currency: string = 'eur'): Promise<Price> {
    const price = await this.provider.prices.retrieve(priceId, {
      expand: ['currency_options', 'product'],
    });

    const isBusinessPlan = price.metadata?.type === 'business';

    const businessSeats = isBusinessPlan ? this.getBusinessSeats(price) : undefined;

    return Price.toDomain({
      id: price.id,
      productId: (price.product as Stripe.Product).id,
      bytes: Number.parseInt(price.metadata.bytes),
      interval: this.getInterval(price.recurring!.interval),
      commitmentPlan: this.hasAnnualCommitment(price),
      recurring: price.type === 'recurring',
      amount: price.currency_options![currency].unit_amount as number,
      currency: price.currency,
      decimalAmount: (price.currency_options![currency].unit_amount as number) / 100,
      type: isBusinessPlan ? UserType.Business : UserType.Individual,
      ...businessSeats,
    });
  }

  private toStripeCustomerParams(params: Partial<UpdateCustomerParams>): Stripe.CustomerCreateParams {
    return {
      ...(params.name && { name: params.name }),
      ...(params.email && { email: params.email }),
      ...(params.phone && { phone: params.phone }),
      ...(params.address && {
        address: {
          line1: params.address.line1 ?? undefined,
          line2: params.address.line2 ?? undefined,
          city: params.address.city ?? undefined,
          state: params.address.state ?? undefined,
          country: params.address.country ?? undefined,
          postal_code: params.address.postalCode ?? undefined,
        },
      }),
      ...(params.metadata && { metadata: params.metadata }),
    };
  }

  private hasAnnualCommitment(price: Stripe.Price): boolean {
    return price?.metadata.annualCommitment === 'true';
  }

  private getInterval(interval: Stripe.Price.Recurring.Interval): PriceInterval {
    switch (interval) {
      case 'year':
        return 'year';
      case 'month':
        return 'month';
      default:
        return 'lifetime';
    }
  }

  private getBusinessSeats(price: Stripe.Price): {
    minimumSeats: number | undefined;
    maximumSeats: number | undefined;
  } {
    return {
      minimumSeats: price.metadata.minimumSeats ? Number.parseInt(price.metadata.minimumSeats) : undefined,
      maximumSeats: price.metadata.maximumSeats ? Number.parseInt(price.metadata.maximumSeats) : undefined,
    };
  }
}

export const stripePaymentsAdapter = new StripePaymentsAdapter();
