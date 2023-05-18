import Stripe from 'stripe';
import { DisplayPrice } from '../core/users/DisplayPrice';
import { User, UserSubscription } from '../core/users/User';

type Customer = Stripe.Customer;
type CustomerId = Customer['id'];
type CustomerEmail = Customer['email'];

type Price = Stripe.Price;
type PriceId = Price['id'];

type Subscription = Stripe.Subscription;
type SubscriptionId = Subscription['id'];

type Invoice = Stripe.Invoice;

type SetupIntent = Stripe.SetupIntent;

type PaymentMethod = Stripe.PaymentMethod;

type CustomerSource = Stripe.CustomerSource;

type HasUserAppliedCouponResponse = {
  elegible: boolean;
  reason?: Record<string, any>;
};

export type Reason = {
  name: string;
  freeDays: number;
};

export type PriceMetadata = {
  maxSpaceBytes: string;
  planType: 'subscription' | 'one_time';
};

export class PaymentService {
  private readonly provider: Stripe;

  constructor(provider: Stripe) {
    this.provider = provider;
  }

  async cancelSubscription(subscriptionId: SubscriptionId): Promise<void> {
    await this.provider.subscriptions.del(subscriptionId, {});
  }

  async getActiveSubscriptions(customerId: CustomerId): Promise<Subscription[]> {
    const res = await this.provider.subscriptions.list({
      customer: customerId,
      expand: ['data.default_payment_method', 'data.default_source'],
    });

    return res.data;
  }

  async updateSubscriptionPrice(
    customerId: CustomerId,
    priceId: PriceId,
    freeTrialPeriod?: Record<string, any>,
    couponCode?: string,
  ): Promise<Subscription> {
    const hasMetadata = freeTrialPeriod ? { metadata: { reason: freeTrialPeriod.name } } : {};
    const individualActiveSubscription = await this.findIndividualActiveSubscription(customerId);
    const updatedSubscription = await this.provider.subscriptions.update(individualActiveSubscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      coupon: couponCode ? couponCode : undefined,
      trial_end: freeTrialPeriod ? Math.floor(freeTrialPeriod.freeDays / 1000) : undefined,
      items: [
        {
          id: individualActiveSubscription.items.data[0].id,
          price: priceId,
        },
      ],
      ...hasMetadata,
    });

    return updatedSubscription;
  }

  async updateSubscriptionPaymentMethod(
    customerId: CustomerId,
    paymentMethod: PaymentMethod['id'],
  ): Promise<Subscription> {
    const individualActiveSubscription = await this.findIndividualActiveSubscription(customerId);
    const updatedSubscription = await this.provider.subscriptions.update(individualActiveSubscription.id, {
      default_payment_method: paymentMethod,
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

  async hasUserAppliedCoupon(customerId: string, reason: Reason): Promise<HasUserAppliedCouponResponse> {
    const userSubscriptions = await this.provider.subscriptions.list({
      customer: customerId,
      status: 'all',
    });

    const isFreeTrialAlreadyApplied = userSubscriptions.data.some(
      (invoice) => invoice.metadata && invoice.metadata.reason === reason.name,
    );
    const date = new Date();
    const freeTrialPeriod = date.setMonth(date.getMonth() + reason.freeDays);
    return isFreeTrialAlreadyApplied
      ? { elegible: false }
      : { elegible: true, reason: { name: reason.name, freeTrial: freeTrialPeriod } };
  }

  async applyCouponToUser(customerId: string, reason: Reason) {
    const hasCouponApplied = await this.hasUserAppliedCoupon(customerId, reason);
    if (hasCouponApplied.elegible) {
      const subscription = await this.findIndividualActiveSubscription(customerId);
      //3 Months of free trial

      await this.updateSubscriptionPrice(
        customerId,
        subscription.items.data[0].plan.id as string,
        hasCouponApplied.reason,
      );

      return true;
    } else {
      throw new CouponCodeError('User already applied coupon');
    }
  }

  getSetupIntent(customerId: string): Promise<SetupIntent> {
    return this.provider.setupIntents.create({ customer: customerId, usage: 'off_session' });
  }

  /*
   *  When a stripe subscription is going to be charged
   *  subscription.default_payment_method takes precedence over
   *  subscription.default_source that precedence over
   *  customer.invoice_settings.default_payment_method that precedence over
   *  customer.default_source
   */
  async getDefaultPaymentMethod(customerId: string): Promise<PaymentMethod | CustomerSource | null> {
    const subscriptions = await this.getActiveSubscriptions(customerId);
    const subscriptionWithDefaultPaymentMethod = subscriptions.find(
      (subscription) => subscription.default_payment_method,
    );
    if (subscriptionWithDefaultPaymentMethod)
      return subscriptionWithDefaultPaymentMethod.default_payment_method as PaymentMethod;

    const subscriptionWithDefaultSource = subscriptions.find((subscription) => subscription.default_source);
    if (subscriptionWithDefaultSource) return subscriptionWithDefaultSource.default_source as CustomerSource;
    const customer = await this.provider.customers.retrieve(customerId, {
      expand: ['default_source', 'invoice_settings.default_payment_method'],
    });

    if (customer.deleted) return null;

    return (
      (customer.invoice_settings.default_payment_method as PaymentMethod) ?? (customer.default_source as CustomerSource)
    );
  }

  async getUserSubscription(customerId: CustomerId): Promise<UserSubscription> {
    let subscription;
    try {
      subscription = await this.findIndividualActiveSubscription(customerId);
    } catch (err) {
      if (err instanceof NotFoundSubscriptionError) {
        return { type: 'free' };
      } else {
        throw err;
      }
    }

    const upcomingInvoice = await this.provider.invoices.retrieveUpcoming({ customer: customerId });

    const { price } = subscription.items.data[0];

    return {
      type: 'subscription',
      amount: price.unit_amount!,
      currency: price.currency,
      interval: price.recurring!.interval as 'year' | 'month',
      nextPayment: subscription.current_period_end,
      amountAfterCoupon: upcomingInvoice.total,
      priceId: price.id,
    };
  }

  async getPrices(): Promise<DisplayPrice[]> {
    const res = await this.provider.prices.search({
      query: 'metadata["show"]:"1" active:"true"',
      limit: 100,
    });

    return res.data
      .filter((price) => price.metadata.maxSpaceBytes)
      .map((price) => ({
        id: price.id,
        currency: price.currency,
        amount: price.unit_amount!,
        bytes: parseInt(price.metadata.maxSpaceBytes),
        interval: price.type === 'one_time' ? 'lifetime' : (price.recurring!.interval as 'year' | 'month'),
      }));
  }

  async getCheckoutSession(
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    prefill: User | string,
    mode: Stripe.Checkout.SessionCreateParams.Mode,
    trialDays?: number,
    couponCode?: string,
  ): Promise<Stripe.Checkout.Session> {
    const subscriptionData = trialDays ? { subscription_data: { trial_period_days: trialDays } } : {};
    const invoiceCreation = mode === 'payment' && { invoice_creation: { enabled: true } };
    return this.provider.checkout.sessions.create({
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: typeof prefill === 'string' ? undefined : prefill?.customerId,
      customer_email: typeof prefill === 'string' ? prefill : undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      discounts: couponCode ? [{ coupon: couponCode }] : undefined,
      allow_promotion_codes: couponCode ? undefined : true,
      billing_address_collection: 'required',
      ...invoiceCreation,
      ...subscriptionData,
    });
  }

  async getLineItems(checkoutSessionId: string) {
    return this.provider.checkout.sessions.listLineItems(checkoutSessionId);
  }

  getCustomer(customerId: CustomerId) {
    return this.provider.customers.retrieve(customerId);
  }

  private async findIndividualActiveSubscription(customerId: CustomerId): Promise<Subscription> {
    const activeSubscriptions = await this.getActiveSubscriptions(customerId);

    const individualActiveSubscription = activeSubscriptions.find(
      (subscription) => subscription.items.data[0].price.metadata.is_teams !== '1',
    );
    if (!individualActiveSubscription) {
      throw new NotFoundSubscriptionError('There is no individual subscription to update');
    }

    return individualActiveSubscription;
  }
}

class NotFoundSubscriptionError extends Error {}
export class CouponCodeError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, CouponCodeError.prototype);
  }
}
