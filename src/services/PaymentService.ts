import Stripe from 'stripe';

type Customer = Stripe.Customer;
type CustomerId = Customer['id'];
type CustomerEmail = Customer['email'];

type Price = Stripe.Price;
type PriceId = Price['id'];

type Subscription = Stripe.Subscription;
type SubscriptionId = Subscription['id'];

type Invoice = Stripe.Invoice;

type SetupIntent = Stripe.SetupIntent;

type CustomerSource = Stripe.CustomerSource;

export class PaymentService {
  private readonly provider: Stripe;

  constructor(provider: Stripe) {
    this.provider = provider;
  }

  async cancelSubscription(subscriptionId: SubscriptionId): Promise<void> {
    await this.provider.subscriptions.del(subscriptionId, {});
  }

  async getActiveSubscriptions(customerId: CustomerId): Promise<Subscription[]> {
    const res = await this.provider.subscriptions.list({ customer: customerId });

    return res.data;
  }

  async updateSubscriptionPrice(customerId: CustomerId, priceId: PriceId): Promise<Subscription> {
    const activeSubscriptions = await this.getActiveSubscriptions(customerId);

    const individualActiveSubscription = activeSubscriptions.find(
      (subscription) => subscription.items.data[0].price.metadata.is_teams !== '1',
    );
    if (!individualActiveSubscription) {
      throw new Error('There is no individual subscription to update');
    }
    const updatedSubscription = await this.provider.subscriptions.update(individualActiveSubscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      items: [
        {
          id: individualActiveSubscription.items.data[0].id,
          price: priceId,
        },
      ],
    });

    return updatedSubscription;
  }

  async getCustomersByEmail(customerEmail: CustomerEmail): Promise<Customer[]> {
    const res = await this.provider.customers.list({ email: customerEmail as string });

    return res.data;
  }

  async getInvoicesFromUser(
    customerId: CustomerId,
    pagination: { limit?: number; startingAfter?: string },
  ): Promise<Invoice[]> {
    const res = await this.provider.invoices.list({
      customer: customerId,
      limit: pagination.limit,
      starting_after: pagination.startingAfter,
    });

    return res.data;
  }

  getSetupIntent(customerId: string): Promise<SetupIntent> {
    return this.provider.setupIntents.create({ customer: customerId });
  }

  async getDefaultPaymentMethod(customerId: string): Promise<CustomerSource | null> {
    const customer = await this.provider.customers.retrieve(customerId, {
      expand: ['default_source'],
    });

    if (customer.deleted) throw new Error('Customer has been deleted');

    return customer.default_source as CustomerSource | null;
  }
}
