import Stripe from 'stripe';
import { DisplayPrice } from '../core/users/DisplayPrice';
import { User, UserSubscription } from '../core/users/User';

type Customer = Stripe.Customer;
export type CustomerId = Customer['id'];
type CustomerEmail = Customer['email'];

type Price = Stripe.Price;
type Plan = Stripe.Plan;

type PriceId = Price['id'];
export type PlanId = Plan['id'];

type Subscription = Stripe.Subscription;
type SubscriptionId = Subscription['id'];

type Invoice = Stripe.Invoice;

type SetupIntent = Stripe.SetupIntent;

type PaymentMethod = Stripe.PaymentMethod;

type CustomerSource = Stripe.CustomerSource;

type HasUserAppliedCouponResponse = {
  elegible: boolean;
  reason?: Reason;
};

export interface RequestedPlan {
  selectedPlan: DisplayPrice & { decimalAmount: number };
  upsellPlan?: DisplayPrice & { decimalAmount: number };
}

export interface PromotionCode {
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.PromotionCode['coupon']['amount_off'];
  percentOff: Stripe.PromotionCode['coupon']['percent_off'];
}

export type Reason = {
  name: 'prevent-cancellation';
};

const commonPaymentMethodTypes: Record<string, Stripe.Checkout.SessionCreateParams.PaymentMethodType[]> = {
  usd: [],
  eur: ['bancontact', 'ideal', 'sofort'],
};

const additionalPaymentTypesForOneTime: Record<string, Stripe.Checkout.SessionCreateParams.PaymentMethodType[]> = {
  usd: [],
  eur: ['alipay', 'eps', 'giropay'],
};

const reasonFreeMonthsMap: Record<Reason['name'], number> = {
  'prevent-cancellation': 3,
};

export type PriceMetadata = {
  maxSpaceBytes: string;
  planType: 'subscription' | 'one_time';
};

export type SubscriptionCreatedObject = {
  type: 'setup' | 'payment';
  clientSecret: string;
};

export type PaymentIntentObject = {
  clientSecret: string | null;
};

export class PaymentService {
  private readonly provider: Stripe;

  constructor(provider: Stripe) {
    this.provider = provider;
  }

  async createCustomer(payload: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    const customer = await this.provider.customers.create(payload);

    return customer;
  }

  async createSubscription(
    customerId: string,
    priceId: string,
    promoCodeId?: Stripe.SubscriptionCreateParams['promotion_code'],
  ): Promise<SubscriptionCreatedObject> {
    if (!customerId || !priceId) {
      throw new MissingParametersError(['customerId', 'priceId']);
    }

    const subscription = await this.provider.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
          discounts: [
            {
              promotion_code: promoCodeId,
            },
          ],
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card', 'paypal'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    });

    if (subscription.pending_setup_intent !== null) {
      return {
        type: 'setup',
        clientSecret: (subscription.pending_setup_intent as any).client_secret,
      };
    } else {
      return {
        type: 'payment',
        clientSecret: (subscription.latest_invoice as any).payment_intent.client_secret,
      };
    }
  }

  async getPaymentIntent(
    customerId: CustomerId,
    amount: number,
    planId: string,
    promoCodeName?: string,
  ): Promise<PaymentIntentObject> {
    if (!customerId || !amount || !planId) {
      throw new MissingParametersError(['customerId', 'amount', 'planId']);
    }

    const product = await this.provider.prices.retrieve(planId);

    const invoice = await this.provider.invoices.create({
      customer: customerId,
      payment_settings: {
        payment_method_types: ['card', 'paypal'],
      },
    });

    await this.provider.invoiceItems.create({
      customer: customerId,
      price: product.id,
      invoice: invoice.id,
      discounts: [
        {
          promotion_code: promoCodeName,
        },
      ],
    });

    const finalizedInvoice = await this.provider.invoices.finalizeInvoice(invoice.id);

    const paymentIntentForFinalizedInvoice = finalizedInvoice.payment_intent;

    const { client_secret } = await this.provider.paymentIntents.retrieve(paymentIntentForFinalizedInvoice as string);

    return {
      clientSecret: client_secret,
    };
  }

  async subscribe(customerId: CustomerId, priceId: PriceId): Promise<{ maxSpaceBytes: number; recurring: boolean }> {
    const price = await this.provider.prices.retrieve(priceId);
    const isRecurring = price.type === 'recurring';

    if (isRecurring) {
      await this.provider.subscriptions.create({
        customer: customerId,
        items: [
          {
            price: priceId,
          },
        ],
      });
    } else {
      await this.provider.invoiceItems.create({
        customer: customerId,
        price: priceId,
        description: 'One-time charge',
      });
      const invoice = await this.provider.invoices.create({
        customer: customerId,
        auto_advance: false,
        pending_invoice_items_behavior: 'include',
      });

      await this.provider.invoices.pay(invoice.id, {
        paid_out_of_band: true,
      });
    }

    return { maxSpaceBytes: parseInt(price.metadata.maxSpaceBytes), recurring: isRecurring };
  }

  async cancelSubscription(subscriptionId: SubscriptionId): Promise<void> {
    await this.provider.subscriptions.cancel(subscriptionId, {});
  }

  async getActiveSubscriptions(customerId: CustomerId): Promise<Subscription[]> {
    const res = await this.provider.subscriptions.list({
      customer: customerId,
      expand: ['data.default_payment_method', 'data.default_source'],
    });

    return res.data;
  }

  /**
   * Function to update the subscription that contains the basic params
   *
   * @param customerId - The customer id
   * @param priceId - The price id
   * @param additionalOptions - Additional options to update the subscription (all the options from Stripe.SubscriptionUpdateParams)
   * @returns The updated subscription
   */
  async updateSub({
    customerId,
    priceId,
    additionalOptions,
  }: {
    customerId: CustomerId;
    priceId: PriceId;
    couponCode?: string;
    additionalOptions?: Partial<Stripe.SubscriptionUpdateParams>;
  }) {
    const individualActiveSubscription = await this.findIndividualActiveSubscription(customerId);
    const updatedSubscription = await this.provider.subscriptions.update(individualActiveSubscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'none',
      items: [
        {
          id: individualActiveSubscription.items.data[0].id,
          price: priceId,
        },
      ],
      ...additionalOptions,
    });

    return updatedSubscription;
  }

  /**
   *  Function to update the subscription with a freeTrial (prevent-cancellation flow)
   * @param customerId - The customer id
   * @param priceId - The price id
   * @param reason - The reason to update the subscription
   * @returns The updated subscription with the corresponding trial_end
   */
  async updateSubscriptionByReason(customerId: CustomerId, priceId: PriceId, reason: Reason) {
    let trialEnd = 0;

    const { data } = await this.provider.subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    const [lastActiveSub] = data;

    if (reason.name in reasonFreeMonthsMap) {
      const date = new Date(lastActiveSub.current_period_end * 1000);
      trialEnd = date.setMonth(date.getMonth() + reasonFreeMonthsMap[reason.name]);
    }

    return this.updateSub({
      customerId: customerId,
      priceId: priceId,
      additionalOptions: {
        trial_end: trialEnd === 0 ? undefined : Math.floor(trialEnd / 1000),
        metadata: { reason: reason.name },
      },
    });
  }

  /**
   * Function to update the subscription price (change the plan)
   * @param customerId - The customer id
   * @param priceId - The price id
   * @param couponCode - The coupon code
   * @returns updated subscription
   */
  async updateSubscriptionPrice({
    customerId,
    priceId,
    couponCode,
  }: {
    customerId: CustomerId;
    priceId: PriceId;
    couponCode: string;
  }) {
    let is3DSecureRequired = false;
    let clientSecret = '';
    const updatedSubscription = await this.updateSub({
      customerId: customerId,
      priceId: priceId,
      additionalOptions: {
        coupon: couponCode,
        billing_cycle_anchor: 'now',
      },
    });

    const getLatestInvoice = await this.provider.invoices.retrieve(updatedSubscription.latest_invoice as string);

    if (getLatestInvoice.payment_intent) {
      const getPaymentIntent: Stripe.PaymentIntent = await this.provider.paymentIntents.retrieve(
        getLatestInvoice.payment_intent as string,
      );
      if (
        getPaymentIntent.status === 'requires_action' &&
        getPaymentIntent.next_action?.type === 'use_stripe_sdk' &&
        getPaymentIntent.client_secret
      ) {
        is3DSecureRequired = true;
        clientSecret = getPaymentIntent.client_secret;
      }
    }

    return {
      is3DSecureRequired,
      clientSecret,
    };
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

  async getCustomersByEmail(customerEmail: CustomerEmail): Promise<Customer> {
    const res = await this.provider.customers.list({ email: customerEmail as string });

    return res.data[0];
  }

  async getPlanIdFromLastPayment(
    customerId: CustomerId,
    pagination: { limit?: number; startingAfter?: string },
  ): Promise<string | null> {
    const res = await this.provider.paymentIntents.list({
      customer: customerId,
      limit: pagination.limit,
      starting_after: pagination.startingAfter,
    });

    const lastPaymentIntent = res.data
      .filter((pi) => pi.status === 'succeeded')
      .sort((a, b) => b.created - a.created)
      .at(0);

    if (!lastPaymentIntent) {
      return null;
    }

    const checkout = await this.provider.checkout.sessions.list({ payment_intent: lastPaymentIntent.id });
    const checkoutLines = await this.provider.checkout.sessions.listLineItems(checkout.data[0].id);
    const productId = checkoutLines.data[0].price?.product;

    return productId as string;
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

  async isUserElegibleForTrial(user: User, reason: Reason): Promise<HasUserAppliedCouponResponse> {
    const { lifetime, customerId } = user;

    if (lifetime) {
      return {
        elegible: false,
      };
    }

    const userSubscriptions = await this.provider.subscriptions.list({
      customer: customerId,
      status: 'all',
    });

    const isFreeTrialAlreadyApplied = userSubscriptions.data.some(
      (invoice) => invoice.metadata && invoice.metadata.reason === reason.name,
    );

    return isFreeTrialAlreadyApplied ? { elegible: false } : { elegible: true };
  }

  async applyFreeTrialToUser(user: User, reason: Reason) {
    const { customerId } = user;
    const hasCouponApplied = await this.isUserElegibleForTrial(user, reason);
    if (hasCouponApplied.elegible) {
      const subscription = await this.findIndividualActiveSubscription(customerId);

      await this.updateSubscriptionByReason(customerId, subscription.items.data[0].plan.id, reason);

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
      planId: price?.product as string,
    };
  }

  async getPrices(currency?: string): Promise<DisplayPrice[]> {
    const currencyValue = currency ?? 'eur';

    const res = await this.provider.prices.search({
      query: `metadata["show"]:"1" active:"true" currency:"${currencyValue}"`,
      expand: ['data.currency_options'],
      limit: 100,
    });

    return res.data
      .filter(
        (price) =>
          price.metadata.maxSpaceBytes && price.currency_options && price.currency_options[currencyValue].unit_amount,
      )
      .map((price) => {
        return {
          id: price.id,
          currency: currencyValue,
          amount: price.currency_options![currencyValue].unit_amount as number,
          bytes: parseInt(price.metadata.maxSpaceBytes),
          interval: price.type === 'one_time' ? 'lifetime' : (price.recurring!.interval as 'year' | 'month'),
        };
      });
  }

  async getUpsellProduct(productId: Stripe.Product['id']): Promise<Stripe.Price | undefined> {
    const productData = await this.provider.prices.list({
      active: true,
      product: productId,
    });
    const upsellProduct = productData.data.find((productItem) => productItem.recurring?.interval === 'year');

    return upsellProduct;
  }

  async getPlanById(planId: PlanId): Promise<RequestedPlan> {
    try {
      let upsellPlan: RequestedPlan['upsellPlan'];

      const { id, currency, unit_amount, metadata, type, recurring, product } = await this.provider.prices.retrieve(
        planId,
      );

      const selectedPlan: RequestedPlan['selectedPlan'] = {
        id: id,
        currency: currency,
        amount: unit_amount as number,
        bytes: parseInt(metadata?.maxSpaceBytes),
        interval: type === 'one_time' ? 'lifetime' : (recurring?.interval as 'year' | 'month'),
        decimalAmount: (unit_amount as number) / 100,
      };

      if (recurring?.interval === 'month') {
        const upsell = await this.getUpsellProduct(product as string);

        if (upsell?.active) {
          upsellPlan = {
            id: upsell.id,
            currency: upsell.currency,
            amount: upsell.unit_amount as number,
            bytes: parseInt(upsell.metadata?.maxSpaceBytes),
            interval: upsell.type === 'one_time' ? 'lifetime' : (upsell.recurring?.interval as 'year' | 'month'),
            decimalAmount: (upsell.unit_amount as number) / 100,
          };
        }
      }

      return {
        selectedPlan,
        upsellPlan,
      };
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('No such price')) throw new NotFoundPlanByIdError(planId);
      throw new Error('Interval Server Error');
    }
  }

  async getPromotionCodeObject(promoCodeName: Stripe.PromotionCode['code']): Promise<Stripe.PromotionCode> {
    const { data } = await this.provider.promotionCodes.list({
      active: true,
      code: promoCodeName,
    });

    if (!data || data.length === 0) {
      throw new NotFoundPromoCodeByNameError(promoCodeName);
    }

    const [lastActiveCoupon] = data;

    if (!lastActiveCoupon?.active) {
      throw new NotFoundPromoCodeByNameError(promoCodeName);
    }

    return lastActiveCoupon;
  }

  async getPromotionCodeByName(promoCodeName: Stripe.PromotionCode['code']): Promise<PromotionCode> {
    const lastActiveCoupon = await this.getPromotionCodeObject(promoCodeName);

    return {
      codeId: lastActiveCoupon.id,
      amountOff: lastActiveCoupon.coupon.amount_off,
      percentOff: lastActiveCoupon.coupon.percent_off,
    };
  }

  private getPaymentMethodTypes(
    currency: string,
    isOneTime: boolean,
  ): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
    const commonPaymentTypes = commonPaymentMethodTypes[currency];
    const additionalPaymentTypes = isOneTime ? additionalPaymentTypesForOneTime[currency] : [];

    return ['card', 'paypal', ...commonPaymentTypes, ...additionalPaymentTypes];
  }

  async getCheckoutSession({
    priceId,
    successUrl,
    cancelUrl,
    prefill,
    mode,
    trialDays,
    couponCode,
    currency,
  }: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    prefill: User | string;
    mode: Stripe.Checkout.SessionCreateParams.Mode;
    trialDays?: number;
    couponCode?: string;
    currency?: string;
  }): Promise<Stripe.Checkout.Session> {
    const productCurrency = currency ?? 'eur';
    const subscriptionData = trialDays ? { subscription_data: { trial_period_days: trialDays } } : {};
    const invoiceCreation = mode === 'payment' && { invoice_creation: { enabled: true } };
    const prices = await this.getPrices(productCurrency);
    const product = prices.find((price) => price.id === priceId);

    const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = this.getPaymentMethodTypes(
      productCurrency,
      product?.interval === 'lifetime',
    );

    if (!product) throw new Error('The product does not exist');

    const checkout = await this.provider.checkout.sessions.create({
      payment_method_types: paymentMethodTypes,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: typeof prefill === 'string' ? undefined : prefill?.customerId,
      customer_email: typeof prefill === 'string' ? prefill : undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: false },
      currency: product.currency,
      mode,
      discounts: couponCode ? [{ coupon: couponCode }] : undefined,
      allow_promotion_codes: couponCode ? undefined : true,
      billing_address_collection: 'required',
      ...invoiceCreation,
      ...subscriptionData,
    });

    return checkout;
  }

  async getLineItems(checkoutSessionId: string) {
    return this.provider.invoices.listLineItems(checkoutSessionId);
  }

  getCustomer(customerId: CustomerId) {
    return this.provider.customers.retrieve(customerId);
  }

  async getCustomerIdByEmail(email: string) {
    const { data } = await this.provider.customers.search({
      query: `email:'${email}'`,
    });

    const customerId = data[0].email;

    return customerId;
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

export class MissingParametersError extends Error {
  constructor(params: string[]) {
    const missingParams = params.concat(', ');
    super(`You must provide the following parameters: ${missingParams}`);

    Object.setPrototypeOf(this, MissingParametersError.prototype);
  }
}

export class NotFoundPlanByIdError extends Error {
  constructor(planId: string) {
    super(`Plan with an id ${planId} does not exist`);

    Object.setPrototypeOf(this, NotFoundPlanByIdError.prototype);
  }
}

export class NotFoundPromoCodeByNameError extends Error {
  constructor(promoCodeId: string) {
    super(`Promotion code with an id ${promoCodeId} does not exist`);

    Object.setPrototypeOf(this, NotFoundPromoCodeByNameError.prototype);
  }
}
