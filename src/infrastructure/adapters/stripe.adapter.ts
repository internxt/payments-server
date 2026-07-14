import Stripe from 'stripe';

import { UserNotFoundError } from '../../errors/PaymentErrors';
import { PaymentsAdapter } from '../domain/ports/payments.adapter';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../domain/entities/customer';
import envVariablesConfig from '../../config';
import { PaymentMethod } from '../domain/entities/paymentMethod';

import { UserType } from '../../core/users/User';
import { Price, PriceInterval } from '../domain/entities/price';
import { Subscription } from '../domain/entities/subscription';
import { Invoice, InvoiceStatus } from '../domain/entities/invoice';
import { InvoiceItems } from '../domain/entities/invoiceItems';

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
      query: `metadata["show"]:"1" active:"true" currency:"eur"`,
      expand: ['data.currency_options', 'data.product'],
      limit: 100,
    });

    return prices.data
      .filter((price) => price.metadata.maxSpaceBytes && price.currency_options)
      .map((price) => {
        const businessSeats = this.getBusinessSeats(price);
        const currencyOptions = price.currency_options![currency] ?? price.currency_options!['eur'];

        return Price.toDomain({
          id: price.id,
          productId: (price.product as Stripe.Product).id,
          bytes: Number.parseInt(price.metadata.maxSpaceBytes),
          interval: this.getInterval(price.recurring?.interval),
          commitmentPlan: this.hasAnnualCommitment(price),
          recurring: price.type === 'recurring',
          amount: currencyOptions.unit_amount as number,
          currency,
          decimalAmount: (currencyOptions.unit_amount as number) / 100,
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
      bytes: Number.parseInt(price.metadata.maxSpaceBytes),
      interval: this.getInterval(price.recurring?.interval),
      commitmentPlan: this.hasAnnualCommitment(price),
      recurring: price.type === 'recurring',
      amount: price.currency_options![currency].unit_amount as number,
      currency,
      decimalAmount: (price.currency_options![currency].unit_amount as number) / 100,
      type: isBusinessPlan ? UserType.Business : UserType.Individual,
      ...businessSeats,
    });
  }

  async updateSubscription(
    subscriptionId: string,
    params: Partial<Stripe.SubscriptionUpdateParams>,
  ): Promise<Subscription> {
    const subscription = await this.provider.subscriptions.update(subscriptionId, params);

    return Subscription.toDomain({
      id: subscription.id,
      customer: subscription.customer as string,
      status: subscription.status,
      priceId: subscription.items.data[0].price.id,
      currentPeriodEnd: subscription.current_period_end,
      metadata: subscription.metadata,
      created: subscription.created,
      trialEnd: subscription.trial_end ?? undefined,
    });
  }

  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.provider.subscriptions.retrieve(subscriptionId, {
      expand: ['plan.product'],
    });

    const paymentMethod =
      typeof subscription.default_payment_method === 'string'
        ? subscription.default_payment_method
        : subscription.default_payment_method?.id;

    return Subscription.toDomain({
      id: subscription.id,
      customer: subscription.customer as string,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      priceId: subscription.items.data[0].price.id,
      created: subscription.created,
      metadata: subscription.metadata,
      trialEnd: subscription.trial_end ?? undefined,
      paymentMethod,
      cancelAt: subscription.cancel_at ?? undefined,
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.provider.subscriptions.cancel(subscriptionId);
  }

  async createInvoice(params?: Partial<Stripe.InvoiceCreateParams>): Promise<Invoice> {
    const invoice = await this.provider.invoices.create(params);

    return Invoice.toDomain({
      id: invoice.id,
      clientSecretId: invoice.confirmation_secret?.client_secret,
      status: invoice.status as InvoiceStatus,
    });
  }

  async addInvoiceItems(
    invoiceId: InvoiceItems['id'],
    customerId: string,
    params: Partial<Stripe.InvoiceItemCreateParams>,
  ): Promise<InvoiceItems> {
    const invoice = await this.provider.invoiceItems.create({ invoice: invoiceId, customer: customerId, ...params });

    return InvoiceItems.toDomain({
      id: invoice.id,
    });
  }

  async finalizeInvoice(invoiceId: Invoice['id']): Promise<Invoice> {
    const finalizedInvoice = await this.provider.invoices.finalizeInvoice(invoiceId, {
      expand: ['payments', 'confirmation_secret'],
    });

    return Invoice.toDomain({
      id: finalizedInvoice.id,
      clientSecretId: finalizedInvoice.confirmation_secret?.client_secret,
      status: finalizedInvoice.status as InvoiceStatus,
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

  private getInterval(interval?: Stripe.Price.Recurring.Interval): PriceInterval {
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
