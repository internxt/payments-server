import Stripe from 'stripe';
import config from '../config';
import { UserNotFoundError } from '../services/users.service';

export class PaymentAdapter {
  private readonly provider: Stripe = new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  getInstance(): Stripe {
    return this.provider;
  }
  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return this.provider.customers.create(params);
  }

  async updateCustomer(customerId: string, params: Stripe.CustomerUpdateParams): Promise<Stripe.Customer> {
    return this.provider.customers.update(customerId, params);
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    const customer = await this.provider.customers.retrieve(customerId);

    if (customer.deleted) {
      throw new UserNotFoundError();
    }

    return customer;
  }

  async searchCustomer(params: Stripe.CustomerSearchParams): Promise<Stripe.Customer[]> {
    const customers = await this.provider.customers.search({
      ...params,
      expand: ['total_count'],
    });

    if (customers?.total_count === 0) {
      throw new UserNotFoundError();
    }

    return customers.data;
  }

  async createCustomerTaxId(params: Stripe.TaxIdCreateParams): Promise<Stripe.TaxId> {
    return this.provider.taxIds.create(params);
  }

  async listCustomerTaxIds(customerId: string, params?: Stripe.TaxIdListParams): Promise<Stripe.ApiList<Stripe.TaxId>> {
    return this.provider.customers.listTaxIds(customerId, params);
  }

  async createSubscription(params: Stripe.SubscriptionCreateParams): Promise<Stripe.Subscription> {
    return this.provider.subscriptions.create(params);
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.provider.subscriptions.update(subscriptionId, params);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.provider.subscriptions.retrieve(subscriptionId, {
      expand: ['plan.product'],
    });
  }

  async createSetupIntent(params: Stripe.SetupIntentCreateParams): Promise<Stripe.SetupIntent> {
    return this.provider.setupIntents.create(params);
  }

  async getPrice(priceId: string): Promise<Stripe.Price> {
    return this.provider.prices.retrieve(priceId);
  }

  async listPrices(params?: Stripe.PriceListParams) {
    return this.provider.prices.list(params);
  }

  async getProduct(productId: Stripe.Product['id'], params?: Stripe.ProductRetrieveParams): Promise<Stripe.Product> {
    return this.provider.products.retrieve(productId, params);
  }

  async createTaxCalculation(params: Stripe.Tax.CalculationCreateParams): Promise<Stripe.Tax.Calculation> {
    return this.provider.tax.calculations.create(params);
  }

  async createInvoice(params: Stripe.InvoiceCreateParams): Promise<Stripe.Invoice> {
    return this.provider.invoices.create(params);
  }

  async updateInvoice(invoiceId: Stripe.Invoice['id'], params: Stripe.InvoiceUpdateParams): Promise<Stripe.Invoice> {
    return this.provider.invoices.update(invoiceId, params);
  }

  async getInvoiceLineItems(
    invoiceId: Stripe.Invoice['id'],
  ): Promise<Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>> {
    return this.provider.invoices.listLineItems(invoiceId, {
      expand: ['data.price.product', 'data.discounts'],
    });
  }

  async getInvoice(invoiceId: Stripe.Invoice['id']): Promise<Stripe.Invoice> {
    return this.provider.invoices.retrieve(invoiceId);
  }

  async payInvoice(invoiceId: Stripe.Invoice['id'], params?: Stripe.InvoicePayParams): Promise<Stripe.Invoice> {
    return this.provider.invoices.pay(invoiceId, params);
  }

  async createPaymentIntent(params: Stripe.PaymentIntentCreateParams): Promise<Stripe.PaymentIntent> {
    return this.provider.paymentIntents.create(params);
  }

  async retrieveCharge(chargeId: Stripe.Charge['id'], params?: Stripe.ChargeRetrieveParams): Promise<Stripe.Charge> {
    return this.provider.charges.retrieve(chargeId, params);
  }

  async listPaymentMethods(params?: Stripe.PaymentMethodListParams): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.provider.paymentMethods.list(params);
  }
}

export const paymentAdapter = new PaymentAdapter();
