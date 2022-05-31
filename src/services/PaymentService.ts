import Stripe from 'stripe';

type Customer = Stripe.Customer;
type CustomerId = Customer['id'];
type CustomerEmail = Customer['email'];

type Plan = Stripe.Plan;
type PlanId = Plan['id'];

type Subscription = Stripe.Subscription;
type SubscriptionId = Subscription['id'];

type Invoice = Stripe.Invoice;

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

  async subscribeCustomerToPlan(customerId: CustomerId, planId: PlanId): Promise<void> {
    await this.provider.subscriptions.create({
      customer: customerId,
      items: [{ plan: planId }],
    });
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
}
