import Stripe from 'stripe';

import { DisplayPrice } from '../core/users/DisplayPrice';
import { ProductsRepository } from '../core/users/ProductsRepository';
import { User, UserSubscription, UserType } from '../core/users/User';
import { Bit2MeService } from './bit2me.service';
import { BadRequestError, NotFoundError } from '../errors/Errors';

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

export interface ExtendedSubscription extends Subscription {
  product?: Stripe.Product;
}

type RequestedPlanData = DisplayPrice & {
  decimalAmount: number;
  minimumSeats?: number;
  maximumSeats?: number;
  type?: UserType;
};

export interface RequestedPlan {
  selectedPlan: RequestedPlanData;
  upsellPlan?: RequestedPlanData;
}

export interface PromotionCode {
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.PromotionCode['coupon']['amount_off'];
  percentOff: Stripe.PromotionCode['coupon']['percent_off'];
}

export interface SubscriptionCreated {
  type: 'setup' | 'payment';
  clientSecret: string;
  subscriptionId?: string;
  paymentIntentId?: string;
}

export interface PaymentIntent {
  clientSecret: string | null;
  id: string;
  invoiceStatus?: string;
}

export type Reason = {
  name: 'prevent-cancellation' | 'pc-cloud-25';
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
  'pc-cloud-25': 6,
};

export type PriceMetadata = {
  maxSpaceBytes: string;
  planType: 'subscription' | 'one_time';
};

export enum RenewalPeriod {
  Monthly = 'monthly',
  Semiannually = 'semiannually',
  Annually = 'annually',
  Lifetime = 'lifetime',
}

export interface PlanSubscription {
  status: string;
  planId: string;
  productId: string;
  name: string;
  simpleName: string;
  type: UserType;
  price: number;
  monthlyPrice: number;
  currency: string;
  isTeam: boolean;
  paymentInterval: string;
  isLifetime: boolean;
  renewalPeriod: RenewalPeriod;
  storageLimit: number;
  amountOfSeats: number;
  seats?: {
    minimumSeats: number;
    maximumSeats: number;
  };
}

export interface PromotionCode {
  promoCodeName: Stripe.PromotionCode['code'];
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.PromotionCode['coupon']['amount_off'];
  percentOff: Stripe.PromotionCode['coupon']['percent_off'];
}

export class PaymentService {
  constructor(
    private readonly provider: Stripe,
    private readonly productsRepository: ProductsRepository,
    private readonly bit2MeService: Bit2MeService,
  ) {}

  async createCustomer(payload: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    const customer = await this.provider.customers.create(payload);

    return customer;
  }

  async getVatIdAndAttachTaxIdToCustomer(customerId: CustomerId, country?: string, companyVatId?: string) {
    try {
      if (country && companyVatId) {
        const taxIds = this.getVatIdFromCountry(country);

        if (taxIds.length > 0) {
          await this.attachTaxIdToCustomer(customerId, companyVatId, taxIds[0]);
        }
      }
    } catch (err) {
      const errCode = (err as any)?.raw?.code;
      if (errCode === 'tax_id_invalid') {
        throw new InvalidTaxIdError();
      }

      throw err;
    }
  }

  async createOrGetCustomer(payload: Stripe.CustomerCreateParams, country?: string, companyVatId?: string) {
    if (!payload.email) {
      throw new MissingParametersError(['email']);
    }

    const { data: customer } = await this.provider.customers.search({
      query: `email:'${payload.email}'`,
    });
    const userExists = !!customer.length;

    if (userExists) {
      await this.getVatIdAndAttachTaxIdToCustomer(customer[0].id, country, companyVatId);

      return customer[0];
    }

    const newCustomer = await this.createCustomer(payload);

    await this.getVatIdAndAttachTaxIdToCustomer(newCustomer.id, country, companyVatId);

    return newCustomer;
  }

  public async checkIfCouponIsAplicable(customerId: CustomerId, promoCodeId: Stripe.PromotionCode['id']) {
    const userInvoices = await this.getInvoicesFromUser(customerId, {});
    const hasUserExistingInvoices = userInvoices.length > 0;
    const hasUserPaidInvoices = userInvoices.some((invoice) => invoice.status === 'paid');

    const promoCode = await this.provider.promotionCodes.retrieve(promoCodeId);
    const isPromoOnlyForFirstPurchase = promoCode.restrictions.first_time_transaction;

    if (hasUserExistingInvoices && hasUserPaidInvoices && isPromoOnlyForFirstPurchase) {
      throw new PromoCodeIsNotValidError(`Promo code ${promoCode.code} is not valid`);
    }

    return promoCode.coupon.id;
  }

  private async checkIfUserAlreadyHasASubscription(customerId: CustomerId, product: Stripe.Product) {
    const userType = (!!product.metadata.type && product.metadata.type) ?? UserType.Individual;

    try {
      const customer = await this.getUserSubscription(customerId, userType as UserType);

      if (customer && customer.type === 'subscription') {
        throw new ExistingSubscriptionError('User already has an active subscription');
      }
    } catch (error) {
      if (!(error instanceof NotFoundSubscriptionError)) {
        throw error;
      }
    }
  }

  async getBusinessSubscriptionSeats(priceId: string) {
    const price = await this.provider.prices.retrieve(priceId);
    const minimumSeats = price.metadata.minimumSeats ?? 1;
    const maximumSeats = price.metadata.maximumSeats ?? 1;

    return {
      minimumSeats,
      maximumSeats,
    };
  }

  async createSubscriptionWithTrial(
    payload: {
      customerId: string;
      priceId: string;
      seatsForBusinessSubscription?: number;
      currency?: string;
      promoCodeId?: Stripe.SubscriptionCreateParams['promotion_code'];
      companyName?: string;
      companyVatId?: string;
    },
    trialReason: Reason,
  ) {
    const now = new Date();
    const trialEnd = Math.floor(now.setMonth(now.getMonth() + reasonFreeMonthsMap[trialReason.name]) / 1000);

    const subscription = await this.createSubscription({
      ...payload,
      trialEnd,
      metadata: { 'why-trial': trialReason.name },
    });

    return subscription;
  }

  async createSubscription({
    customerId,
    priceId,
    seatsForBusinessSubscription = 1,
    currency,
    promoCodeId,
    companyName,
    companyVatId,
    trialEnd,
    metadata,
    additionalOptions,
  }: {
    customerId: string;
    priceId: string;
    seatsForBusinessSubscription?: number;
    currency?: string;
    promoCodeId?: Stripe.SubscriptionCreateParams['promotion_code'];
    companyName?: string;
    companyVatId?: string;
    trialEnd?: number;
    metadata?: Stripe.Metadata;
    additionalOptions?: Partial<Stripe.SubscriptionCreateParams>;
  }): Promise<SubscriptionCreated> {
    const currencyValue = currency ?? 'eur';
    let couponId;

    const price = await this.provider.prices.retrieve(priceId, {
      expand: ['product'],
    });
    const product = price.product as Stripe.Product;
    const isBusinessProduct = !!product.metadata.type && product.metadata.type === UserType.Business;
    const isObjStorageProduct = !!product.metadata.type && product.metadata.type === UserType.ObjectStorage;
    const seats = isObjStorageProduct ? undefined : seatsForBusinessSubscription;
    const minimumSeats = price.metadata.minimumSeats ?? 1;
    const maximumSeats = price.metadata.maximumSeats ?? 1;

    if (isBusinessProduct && minimumSeats && maximumSeats) {
      if (seatsForBusinessSubscription > parseInt(maximumSeats)) {
        throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
      }

      if (seatsForBusinessSubscription < parseInt(minimumSeats)) {
        throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
      }
    }

    await this.checkIfUserAlreadyHasASubscription(customerId, product);

    if (promoCodeId) {
      couponId = await this.checkIfCouponIsAplicable(customerId, promoCodeId);
    }

    const subscription = await this.provider.subscriptions.create({
      customer: customerId,
      currency: currencyValue,
      items: [
        {
          price: priceId,
          quantity: seats,
        },
      ],
      discounts: [
        {
          coupon: couponId,
        },
      ],
      metadata: {
        companyName: companyName ?? null,
        companyVatId: companyVatId ?? null,
        ...metadata,
      },
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card', 'paypal'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
      trial_end: trialEnd ? trialEnd : undefined,
      ...additionalOptions,
    });

    if (subscription.pending_setup_intent !== null) {
      return {
        type: 'setup',
        clientSecret: (subscription.pending_setup_intent as any).client_secret,
        subscriptionId: subscription.id,
      };
    } else {
      return {
        type: 'payment',
        clientSecret: (subscription.latest_invoice as any).payment_intent.client_secret,
        subscriptionId: subscription.id,
        paymentIntentId: (subscription.latest_invoice as any).payment_intent.id,
      };
    }
  }

  /**
   * Creates an invoice to purchase a one time plan.
   *
   * @param customerId - The ID of the customer who is purchasing the plan.
   * @param priceId - The ID of the price associated with the lifetime plan.
   * @param currency - The currency in which the purchase is made.
   * @param promoCodeId - (Optional) The promotion code applied to the purchase, if any.
   *
   * @returns {PaymentIntent} An object containing:
   * - `client_secret`: to be used with Stripe Elements,
   * - `invoice_id`: the ID of the created invoice,
   * - `invoice_status`: the current status of the invoice (e.g., `paid`, `open`, etc.).
   */
  async createInvoice({
    customerId,
    priceId,
    currency = 'eur',
    promoCodeId,
    additionalInvoiceOptions,
  }: {
    customerId: string;
    priceId: string;
    currency?: string;
    promoCodeId?: string;
    additionalInvoiceOptions?: Partial<Stripe.InvoiceCreateParams>;
  }): Promise<PaymentIntent> {
    let couponId: string | undefined = undefined;

    const invoice = await this.provider.invoices.create({
      customer: customerId,
      currency: currency,
      payment_settings: {
        payment_method_types: ['card', 'paypal'],
      },
      ...additionalInvoiceOptions,
    });

    if (promoCodeId) {
      couponId = await this.checkIfCouponIsAplicable(customerId, promoCodeId);
    }

    await this.provider.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      price: priceId,
      discounts: [
        {
          coupon: couponId,
        },
      ],
    });

    const finalizedInvoice = await this.provider.invoices.finalizeInvoice(invoice.id);

    const paymentIntentForFinalizedInvoice = finalizedInvoice.payment_intent;

    if (!paymentIntentForFinalizedInvoice && finalizedInvoice.status === 'paid') {
      return {
        clientSecret: '',
        id: '',
        invoiceStatus: finalizedInvoice.status,
      };
    }

    const { client_secret, id } = await this.provider.paymentIntents.retrieve(
      paymentIntentForFinalizedInvoice as string,
    );

    return {
      clientSecret: client_secret,
      id,
    };
  }

  /**
   * @deprecated Use `createInvoice` instead.
   *
   * Creates an invoice to purchase a lifetime plan.
   *
   * @param customerId - The ID of the customer who is purchasing the plan.
   * @param priceId - The ID of the price associated with the lifetime plan.
   * @param currency - The currency in which the purchase is made.
   * @param promoCodeId - (Optional) The promotion code applied to the purchase, if any.
   *
   * @returns {PaymentIntent} An object containing:
   * - `client_secret`: to be used with Stripe Elements,
   * - `invoice_id`: the ID of the created invoice,
   * - `invoice_status`: the current status of the invoice (e.g., `paid`, `open`, etc.).
   */

  async createPaymentIntent(
    customerId: CustomerId,
    amount: number,
    priceId: string,
    currency?: string,
    promoCodeId?: Stripe.PromotionCode['id'],
  ): Promise<PaymentIntent> {
    let couponId;
    const currencyValue = currency ?? 'eur';

    if (!customerId || !amount || !priceId) {
      throw new MissingParametersError(['customerId', 'amount', 'priceId']);
    }

    const product = await this.provider.prices.retrieve(priceId);

    const invoice = await this.provider.invoices.create({
      customer: customerId,
      currency: currencyValue,
      payment_settings: {
        payment_method_types: ['card', 'paypal'],
      },
    });

    if (promoCodeId) {
      couponId = await this.checkIfCouponIsAplicable(customerId, promoCodeId);
    }

    await this.provider.invoiceItems.create({
      customer: customerId,
      price: product.id,
      invoice: invoice.id,
      discounts: [
        {
          coupon: couponId,
        },
      ],
    });

    const finalizedInvoice = await this.provider.invoices.finalizeInvoice(invoice.id);

    const paymentIntentForFinalizedInvoice = finalizedInvoice.payment_intent;

    if (!paymentIntentForFinalizedInvoice && finalizedInvoice.status === 'paid') {
      return {
        clientSecret: '',
        id: '',
        invoiceStatus: finalizedInvoice.status,
      };
    }

    const { client_secret, id } = await this.provider.paymentIntents.retrieve(
      paymentIntentForFinalizedInvoice as string,
    );

    return {
      clientSecret: client_secret,
      id,
    };
  }

  async updateCustomerBillingInfo(
    customerId: CustomerId,
    payload: Pick<Stripe.CustomerUpdateParams, 'address' | 'phone'>,
  ): Promise<Stripe.Customer> {
    const customer = await this.provider.customers.update(customerId, payload);

    return customer;
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

  async getActiveSubscriptions(customerId: CustomerId): Promise<ExtendedSubscription[]> {
    const res = await this.provider.subscriptions.list({
      customer: customerId,
      expand: ['data.default_payment_method', 'data.default_source', 'data.plan.product'],
    });

    const transformedData: ExtendedSubscription[] = res.data.map((subscription) => {
      const untypedSubscription = subscription as any;
      if ('plan' in untypedSubscription) {
        return {
          ...subscription,
          product: (untypedSubscription.plan as Stripe.Plan).product as Stripe.Product,
        };
      }
      return subscription;
    });

    const activeOrTrialingSubscriptions = transformedData.filter(
      (subscription) => subscription.status === 'active' || subscription.status === 'trialing',
    );

    return activeOrTrialingSubscriptions;
  }

  async getSubscriptionById(subscriptionId: string) {
    return this.provider.subscriptions.retrieve(subscriptionId, {
      expand: ['plan.product'],
    });
  }

  /**
   * Function to update the subscription that contains the basic params
   *
   * @param customerId - The customer id
   * @param priceId - The price id
   * @param additionalOptions - Additional options to update the subscription (all the options from Stripe.SubscriptionUpdateParams)
   * @returns The updated subscription
   */
  async updateIndividualSub({
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

    const newPrice = await this.provider.prices.retrieve(priceId, {
      expand: ['product'],
    });
    const newProduct = newPrice.product as Stripe.Product;

    if (newProduct.metadata.type === UserType.Business) {
      throw new IncompatibleSubscriptionTypesError('The new price is not an individual price');
    }

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

  async updateBusinessSub({
    customerId,
    priceId,
    additionalOptions,
    seats,
  }: {
    customerId: CustomerId;
    priceId: PriceId;
    couponCode?: string;
    seats?: number;
    additionalOptions?: Partial<Stripe.SubscriptionUpdateParams>;
  }) {
    const businessActiveSubscription = await this.findBusinessActiveSubscription(customerId);
    const currentItem = businessActiveSubscription.items.data[0];

    const newPrice = await this.provider.prices.retrieve(priceId, {
      expand: ['product'],
    });
    const newProduct = newPrice.product as Stripe.Product;

    if (newProduct.metadata.type !== UserType.Business) {
      throw new IncompatibleSubscriptionTypesError('The new price is not a business price');
    }

    if ((currentItem.quantity ?? 1) > parseInt(newPrice.metadata.maximumSeats)) {
      throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
    }

    if ((currentItem.quantity ?? 1) < parseInt(newPrice.metadata.minimumSeats)) {
      throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
    }

    const updatedSubscription = await this.provider.subscriptions.update(businessActiveSubscription.id, {
      cancel_at_period_end: false,
      proration_behavior: additionalOptions?.proration_behavior ?? 'none',
      items: [
        {
          id: businessActiveSubscription.items.data[0].id,
          price: priceId,
          quantity: seats ?? currentItem.quantity,
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

    return this.updateIndividualSub({
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
  async updateSubscriptionPrice(
    {
      customerId,
      priceId,
      couponCode,
    }: {
      customerId: CustomerId;
      priceId: PriceId;
      couponCode: string;
    },
    userType: UserType = UserType.Individual,
  ) {
    let is3DSecureRequired = false;
    let clientSecret = '';

    const updatedSubscription =
      userType === UserType.Individual
        ? await this.updateIndividualSub({
            customerId: customerId,
            priceId: priceId,
            additionalOptions: {
              coupon: couponCode,
              billing_cycle_anchor: 'now',
            },
          })
        : await this.updateBusinessSub({
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
    paymentMethodId: PaymentMethod['id'],
    userType: UserType = UserType.Individual,
  ): Promise<Subscription> {
    const { id: subscriptionId } =
      userType === UserType.Business
        ? await this.findBusinessActiveSubscription(customerId)
        : await this.findIndividualActiveSubscription(customerId);

    if (!subscriptionId) throw new Error('Subscription not found');

    const { id, customer } = await this.provider.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    if (!id || !customer) throw new Error('Payment method not attached');

    return this.provider.subscriptions.update(subscriptionId, {
      default_payment_method: id,
    });
  }

  async getCustomersByEmail(customerEmail: CustomerEmail): Promise<Customer[]> {
    const res = await this.provider.customers.list({ email: customerEmail as string });

    return res.data;
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
    subscriptionId?: SubscriptionId,
  ): Promise<Invoice[]> {
    const res = await this.provider.invoices.list({
      customer: customerId,
      limit: pagination.limit,
      starting_after: pagination.startingAfter,
      subscription: subscriptionId,
    });

    return res.data;
  }

  private invoiceType(invoice: Stripe.Invoice, userType: UserType) {
    return userType === UserType.Business
      ? invoice.lines?.data?.[0]?.price?.metadata?.type === 'business'
      : invoice.lines?.data?.[0]?.price?.metadata?.type !== 'business';
  }

  async getDriveInvoices(
    customerId: CustomerId,
    pagination: { limit?: number; startingAfter?: string },
    userType: UserType = UserType.Individual,
    subscriptionId?: SubscriptionId,
  ) {
    const { limit, startingAfter } = pagination;

    const invoices = await this.getInvoicesFromUser(customerId, { limit, startingAfter }, subscriptionId);

    const invoicesMapped = invoices
      .filter((invoice) =>
        invoice.created &&
        invoice.invoice_pdf &&
        invoice.lines?.data?.[0]?.price?.metadata?.maxSpaceBytes &&
        invoice.lines?.data?.[0]?.price?.metadata?.type !== 'object-storage' &&
        subscriptionId
          ? true
          : this.invoiceType(invoice, userType),
      )
      .map((invoice) => {
        return {
          id: invoice.id,
          created: invoice.created,
          pdf: invoice.invoice_pdf,
          bytesInPlan: invoice.lines.data[0].price!.metadata.maxSpaceBytes,
          total: invoice.total,
          currency: invoice.currency,
          product: invoice.lines.data[0].price?.product,
        };
      });

    return invoicesMapped;
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

  getSetupIntent(customerId: string, metadata: Stripe.MetadataParam): Promise<SetupIntent> {
    return this.provider.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      metadata,
    });
  }

  /*
   *  When a stripe subscription is going to be charged
   *  subscription.default_payment_method takes precedence over
   *  subscription.default_source that precedence over
   *  customer.invoice_settings.default_payment_method that precedence over
   *  customer.default_source
   */
  async getDefaultPaymentMethod(
    customerId: CustomerId,
    isLifetime?: boolean,
    userType: UserType = UserType.Individual,
  ): Promise<PaymentMethod | CustomerSource | null> {
    if (isLifetime && userType === UserType.Individual) {
      const { data: userPaymentMethod } = await this.provider.paymentMethods.list({
        customer: customerId,
      });

      if (userPaymentMethod.length === 0) return null;

      return userPaymentMethod[0];
    }

    let subscriptions = await this.getActiveSubscriptions(customerId);
    if (subscriptions.length === 0) return null;

    subscriptions =
      userType === UserType.Business
        ? subscriptions.filter((subs) => subs.product?.metadata?.type === UserType.Business)
        : subscriptions.filter((subs) => subs.product?.metadata?.type !== UserType.Business);

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

  getPaymentMethod(paymentMethod: string | Stripe.PaymentMethod): Promise<PaymentMethod> {
    return typeof paymentMethod === 'string'
      ? this.provider.paymentMethods.retrieve(paymentMethod)
      : this.provider.paymentMethods.retrieve(paymentMethod.id);
  }

  async getUserSubscription(customerId: CustomerId, userType?: UserType): Promise<UserSubscription> {
    let subscription: any;
    try {
      if (userType === UserType.ObjectStorage) {
        subscription = await this.findObjectStorageActiveSubscription(customerId);
      } else if (userType === UserType.Business) {
        subscription = await this.findBusinessActiveSubscription(customerId);
      } else {
        subscription = await this.findIndividualActiveSubscription(customerId);
      }
    } catch (err) {
      if (err instanceof NotFoundSubscriptionError) {
        return { type: 'free' };
      } else {
        throw err;
      }
    }

    const upcomingInvoice = await this.provider.invoices.retrieveUpcoming({ customer: customerId });

    const storageLimit =
      Number(
        subscription.plan.product.metadata.size_bytes ||
          subscription.plan.product.metadata.maxSpaceBytes ||
          subscription.plan.metadata.size_bytes ||
          subscription.plan.metadata.maxSpaceBytes,
      ) || 0;
    const item = subscription.items.data[0] as Stripe.SubscriptionItem;

    const plan: PlanSubscription = {
      status: subscription.status,
      planId: subscription.plan.id,
      productId: subscription.plan.product.id,
      name: subscription.plan.product.name,
      simpleName: subscription.plan.product.metadata.simple_name,
      type: subscription.plan.product.metadata.type || UserType.Individual,
      price: subscription.plan.amount * 0.01,
      monthlyPrice: this.getMonthlyAmount(
        subscription.plan.amount * 0.01,
        subscription.plan.interval_count,
        subscription.plan.interval,
      ),
      currency: subscription.plan.currency,
      isTeam: !!subscription.plan.product.metadata.is_teams,
      paymentInterval: subscription.plan.nickname,
      isLifetime: false,
      renewalPeriod: this.getRenewalPeriod(subscription.plan.intervalCount, subscription.plan.interval),
      storageLimit: storageLimit,
      amountOfSeats: item.quantity || 1,
      seats: {
        minimumSeats: Number(item.price.metadata.minimumSeats) ?? 3,
        maximumSeats: Number(item.price.metadata.maximumSeats) ?? 10,
      },
    };

    const { price } = subscription.items.data[0];

    return {
      type: 'subscription',
      subscriptionId: subscription.id,
      amount: price.unit_amount!,
      currency: price.currency,
      interval: price.recurring!.interval as 'year' | 'month',
      nextPayment: subscription.current_period_end,
      amountAfterCoupon: upcomingInvoice.total,
      priceId: price.id,
      productId: price?.product as string,
      userType,
      plan,
    };
  }

  async getPrices(currency?: string, userType: UserType = UserType.Individual): Promise<DisplayPrice[]> {
    const currencyValue = currency ?? 'eur';

    const res = await this.provider.prices.search({
      query: `metadata["show"]:"1" active:"true" currency:"${currencyValue}"`,
      expand: ['data.currency_options', 'data.product'],
      limit: 100,
    });

    return res.data
      .filter((price) => {
        const priceProductType = ((price.product as Stripe.Product).metadata.type as UserType) || UserType.Individual;
        return (
          price.metadata.maxSpaceBytes &&
          price.currency_options &&
          price.currency_options[currencyValue].unit_amount &&
          priceProductType === userType
        );
      })
      .map((price) => {
        return {
          id: price.id,
          productId: (price.product as Stripe.Product).id,
          currency: currencyValue,
          amount: price.currency_options![currencyValue].unit_amount as number,
          bytes: parseInt(price.metadata.maxSpaceBytes),
          interval: price.type === 'one_time' ? 'lifetime' : (price.recurring!.interval as 'year' | 'month'),
        };
      });
  }

  async getPricesRaw(currency?: string, expandProduct = false): Promise<Stripe.Price[]> {
    const currencyValue = currency ?? 'eur';

    const expandOptions = ['data.currency_options'];

    if (expandProduct) {
      expandOptions.push('data.product');
    }

    //!TODO: add metadata["show"]:"1" in query param
    const res = await this.provider.prices.search({
      query: `active:"true" currency:"${currencyValue}"`,
      expand: expandOptions,
      limit: 100,
    });

    return res.data.filter(
      (price) =>
        price.metadata.maxSpaceBytes && price.currency_options && price.currency_options[currencyValue].unit_amount,
    );
  }

  async getUpsellProduct(productId: Stripe.Product['id'], currency: string): Promise<Stripe.Price | undefined> {
    const productData = await this.provider.prices.list({
      active: true,
      product: productId,
      currency: currency,
      expand: ['data.currency_options'],
    });

    const upsellProduct = productData.data.find((productItem) => productItem.recurring?.interval === 'year');

    return upsellProduct;
  }

  async getObjectStoragePlanById(priceId: PlanId, currency?: string) {
    const currencyValue = currency ?? 'eur';
    try {
      const price = await this.provider.prices.retrieve(priceId, {});

      const { id, metadata, type, recurring } = price;

      const selectedPlan: RequestedPlan['selectedPlan'] = {
        id: id,
        currency: currencyValue,
        amount: price.unit_amount as number,
        bytes: parseInt(metadata?.maxSpaceBytes),
        interval: type === 'one_time' ? 'lifetime' : (recurring?.interval as 'year' | 'month'),
        decimalAmount: (price.unit_amount as number) / 100,
      };

      return selectedPlan;
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('No such price')) throw new NotFoundPlanByIdError(priceId);
      throw new Error(error.message);
    }
  }

  /**
   * Returns the requested price if exists
   * @param priceId - The id of the requested price
   * @param currency - The currency of the requested price
   * @returns - The selected price if it exists and it is active
   */
  async getPriceById(priceId: string, currency = 'eur') {
    const availablePrices = await this.getPricesRaw(currency);

    const selectedPrice = availablePrices.find((price) => price.id === priceId && price.active);

    if (!selectedPrice) {
      throw new NotFoundError('The requested price does not exist');
    }

    let businessSeats;
    const { currency_options, recurring, metadata, type, product } = selectedPrice;
    const isBusinessPrice = metadata?.type === 'business';

    if (isBusinessPrice) {
      businessSeats = {
        minimumSeats: Number(metadata.minimumSeats),
        maximumSeats: Number(metadata.maximumSeats),
      };
    }

    return {
      id: priceId,
      currency,
      amount: currency_options![currency].unit_amount as number,
      bytes: parseInt(metadata?.maxSpaceBytes),
      interval: type === 'one_time' ? 'lifetime' : recurring?.interval,
      decimalAmount: (currency_options![currency].unit_amount as number) / 100,
      type: isBusinessPrice ? UserType.Business : UserType.Individual,
      product: product as string,
      ...businessSeats,
    };
  }

  /**
   * Returns the tax for a given price
   * @param priceId - The Id of the price that we want to calculate the tax for
   * @param amount - The amount of the price
   * @param ipAddress - The IP address of the user
   * @param currency - The currency of the price
   * @returns - The tax calculation object
   */
  async calculateTax(
    priceId: string,
    amount: number,
    ipAddress: string,
    currency = 'eur',
    customerId?: string,
    postalCode?: string,
    country?: string,
  ): Promise<Stripe.Tax.Calculation> {
    const customerDetails: Stripe.Tax.CalculationCreateParams.CustomerDetails = {};

    if (postalCode && country) {
      customerDetails.address = {
        postal_code: postalCode,
        country: country,
      };
      customerDetails.address_source = 'billing';
    } else {
      customerDetails.ip_address = ipAddress;
    }

    return this.provider.tax.calculations.create({
      customer: customerId,
      customer_details: customerId ? undefined : customerDetails,
      line_items: [
        {
          amount,
          reference: priceId,
          tax_behavior: 'exclusive',
          quantity: 1,
        },
      ],
      currency,
    });
  }

  /**
   * Deprecated - Use getPriceById instead
   * @param priceId - Id of the price we want to fetch
   * @param currency - Currency if needed
   * @returns - The selected plan and their upsell if needed
   */
  async getPlanById(priceId: PlanId, currency?: string): Promise<RequestedPlan> {
    let upsellPlan: RequestedPlan['upsellPlan'];
    let businessSeats;
    const currencyValue = currency ?? 'eur';

    try {
      const prices = await this.getPricesRaw(currencyValue);

      const price = prices.find((price) => price.id === priceId);

      if (!price) {
        throw new NotFoundPlanByIdError(priceId);
      }

      const { id, currency, metadata, type, recurring, product: productId } = price;

      const isBusinessPrice = !!metadata.type && metadata.type === 'business';

      if (isBusinessPrice) {
        businessSeats = {
          minimumSeats: Number(metadata.minimumSeats),
          maximumSeats: Number(metadata.maximumSeats),
        };
      }

      const selectedPlan: RequestedPlan['selectedPlan'] = {
        id: id,
        currency: currencyValue,
        amount: price.currency_options![currencyValue].unit_amount as number,
        bytes: parseInt(metadata?.maxSpaceBytes),
        interval: type === 'one_time' ? 'lifetime' : (recurring?.interval as 'year' | 'month'),
        decimalAmount: (price.currency_options![currencyValue].unit_amount as number) / 100,
        type: isBusinessPrice ? UserType.Business : UserType.Individual,
        ...businessSeats,
      };

      if (recurring?.interval === 'month') {
        const upsell = await this.getUpsellProduct(productId as string, currency);

        if (upsell?.active) {
          upsellPlan = {
            id: upsell.id,
            currency: currencyValue,
            amount: upsell.currency_options![currencyValue].unit_amount as number,
            bytes: parseInt(upsell.metadata?.maxSpaceBytes),
            interval: upsell.type === 'one_time' ? 'lifetime' : (upsell.recurring?.interval as 'year' | 'month'),
            decimalAmount: (upsell.currency_options![currencyValue].unit_amount as number) / 100,
            type: isBusinessPrice ? UserType.Business : UserType.Individual,
            ...businessSeats,
          };
        }
      }

      return {
        selectedPlan,
        upsellPlan,
      };
    } catch (err) {
      const error = err as Error;
      if (error instanceof NotFoundPlanByIdError || error.message.includes('No such price'))
        throw new NotFoundPlanByIdError(priceId);
      throw new Error('Interval Server Error');
    }
  }

  private getPaymentMethodTypes(
    currency: string,
    isOneTime: boolean,
  ): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
    const commonPaymentTypes = commonPaymentMethodTypes[currency];
    const additionalPaymentTypes = isOneTime ? additionalPaymentTypesForOneTime[currency] : [];

    return ['card', 'paypal', ...commonPaymentTypes, ...additionalPaymentTypes];
  }

  /**
   * @deprecated Use `getPromoCode` instead
   * @param promoCodeName - The name of the promotion code
   * @returns The ACTIVE promotion code object
   */
  async getPromotionCodeObject(promoCodeName: Stripe.PromotionCode['code']): Promise<Stripe.PromotionCode> {
    const { data: promotionCodes } = await this.provider.promotionCodes.list({
      active: true,
      code: promoCodeName,
      expand: ['data.coupon.applies_to'],
    });

    if (!promotionCodes || promotionCodes.length === 0) {
      throw new NotFoundPromoCodeByNameError(promoCodeName);
    }

    const [lastActiveCoupon] = promotionCodes;

    if (!lastActiveCoupon?.active) {
      throw new NotFoundPromoCodeByNameError(promoCodeName);
    }

    return lastActiveCoupon;
  }

  /**
   * This function is used to get the promotion code object from Stripe.
   * @param promoCodeName - The name of the promotion code
   * @returns The ACTIVE promotion code object
   */
  async getPromoCode(promoCodeName: Stripe.PromotionCode['code']): Promise<Stripe.PromotionCode> {
    const { data: promotionCodes } = await this.provider.promotionCodes.list({
      active: true,
      code: promoCodeName,
      expand: ['data.coupon.applies_to'],
    });

    if (!promotionCodes || promotionCodes.length === 0) {
      throw new NotFoundError(`The promotion code ${promoCodeName} does not exist`);
    }

    const [lastActiveCoupon] = promotionCodes;
    if (!lastActiveCoupon?.active) {
      throw new NotFoundError(`The promotion code ${promoCodeName} is not active`);
    }

    return lastActiveCoupon;
  }

  /**
   * This function is used to get some information about the promotion code using the code of the Promotion code.
   * @param product - The id of the product we want to apply the promo code
   * @param promoCodeName - The name of the promotion code
   * @returns The promotion code object
   */
  async getPromoCodeByName(product: string, promoCodeName: Stripe.PromotionCode['code']): Promise<PromotionCode> {
    const promoCode = await this.getPromoCode(promoCodeName);

    const promoCodeIsAppliedTo = promoCode.coupon.applies_to?.products;

    const isProductAllowed = promoCodeIsAppliedTo?.find((productId) => productId === product);

    if (promoCodeIsAppliedTo && !isProductAllowed) {
      throw new BadRequestError(`Promo code ${promoCodeName} is not valid`);
    }

    return {
      promoCodeName,
      codeId: promoCode.id,
      amountOff: promoCode.coupon.amount_off,
      percentOff: promoCode.coupon.percent_off,
    };
  }

  async getPromotionCodeByName(priceId: string, promoCodeName: Stripe.PromotionCode['code']): Promise<PromotionCode> {
    if (!promoCodeName || !priceId) {
      throw new MissingParametersError(['promoCode', 'priceId']);
    }

    const promoCode = await this.getPromotionCodeObject(promoCodeName);

    const product = await this.provider.prices.retrieve(priceId);

    const promoCodeIsAppliedTo = promoCode.coupon.applies_to?.products;

    const isProductAllowed =
      promoCodeIsAppliedTo && promoCodeIsAppliedTo.find((productId) => productId === (product.product as string));

    if (promoCodeIsAppliedTo && !isProductAllowed) {
      throw new PromoCodeIsNotValidError(`Promo code ${promoCodeName} is not valid`);
    }

    return {
      promoCodeName,
      codeId: promoCode.id,
      amountOff: promoCode.coupon.amount_off,
      percentOff: promoCode.coupon.percent_off,
    };
  }

  async checkActiveSubscriptions(customerId: string, productType: UserType): Promise<void> {
    let activeSubscriptions;
    try {
      activeSubscriptions =
        productType === 'business'
          ? await this.findBusinessActiveSubscription(customerId)
          : await this.findIndividualActiveSubscription(customerId);
    } catch (error) {
      if (!(error instanceof NotFoundSubscriptionError)) {
        throw error;
      }
    }

    if (activeSubscriptions) {
      throw new ExistingSubscriptionError('User already has an active subscription of the same type');
    }
  }

  async getCheckoutSession({
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    prefill,
    mode,
    trialDays,
    couponCode,
    currency,
    seats,
  }: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    prefill: User | string;
    mode: Stripe.Checkout.SessionCreateParams.Mode;
    customerId: CustomerId | undefined;
    trialDays?: number;
    couponCode?: Stripe.PromotionCode['id'];
    currency?: string;
    seats?: number;
  }): Promise<Stripe.Checkout.Session> {
    let promoCodeId: Stripe.PromotionCode['id'] | undefined;

    const productCurrency = currency ?? 'eur';
    const subscriptionData = trialDays ? { subscription_data: { trial_period_days: trialDays } } : {};
    const invoiceCreation = mode === 'payment' && { invoice_creation: { enabled: true } };
    const prices = await this.getPricesRaw(productCurrency, true);
    const selectedPrice = prices.find((price) => price.id === priceId);
    const product = selectedPrice?.product as Stripe.Product;
    const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = this.getPaymentMethodTypes(
      productCurrency,
      selectedPrice?.type === 'one_time',
    );

    if (!selectedPrice) throw new Error('The product does not exist');

    const customerIsRegistered = customerId ? await this.getCustomer(customerId) : undefined;
    const newPriceIsNotLifetime = selectedPrice.type !== 'one_time';

    if (customerIsRegistered && newPriceIsNotLifetime && customerId) {
      await this.checkActiveSubscriptions(customerId, (product.metadata.type as UserType) || UserType.Individual);
    }

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];
    if (product.metadata?.type === 'business') {
      const minimumSeats = selectedPrice.metadata?.minimumSeats ? parseInt(selectedPrice.metadata.minimumSeats) : 1;
      const maximumSeats = selectedPrice.metadata?.maximumSeats ? parseInt(selectedPrice.metadata.maximumSeats) : 100;
      let seatNumber = seats ?? minimumSeats;

      if (maximumSeats && seatNumber > maximumSeats) {
        seatNumber = maximumSeats;
      }

      lineItems = [
        {
          price: priceId,
          adjustable_quantity: {
            enabled: true,
            minimum: minimumSeats,
            maximum: maximumSeats,
          },
          quantity: seatNumber,
        },
      ];
    }

    if (couponCode) {
      const { restrictions } = await this.provider.promotionCodes.retrieve(couponCode as string);

      const isCouponOnlyForFirstPurchase = restrictions.first_time_transaction;

      const userInvoices = await this.provider.invoices.list({
        customer: customerId,
      });

      if (!isCouponOnlyForFirstPurchase || (isCouponOnlyForFirstPurchase && !userInvoices)) {
        promoCodeId = couponCode;
      }
    }

    const checkout = await this.provider.checkout.sessions.create({
      payment_method_types: paymentMethodTypes,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: typeof prefill === 'string' ? undefined : prefill?.customerId,
      customer_email: typeof prefill === 'string' ? prefill : undefined,
      line_items: lineItems,
      automatic_tax: { enabled: false },
      currency: productCurrency,
      mode,
      discounts: promoCodeId ? [{ promotion_code: promoCodeId }] : undefined,
      allow_promotion_codes: promoCodeId ? undefined : true,
      billing_address_collection: 'required',
      ...invoiceCreation,
      ...subscriptionData,
    });

    return checkout;
  }

  async getCheckoutLineItems(checkoutSessionId: string) {
    return this.provider.checkout.sessions.listLineItems(checkoutSessionId, {
      expand: ['data.price.product'],
    });
  }

  async getInvoiceLineItems(invoiceId: string) {
    return this.provider.invoices.listLineItems(invoiceId, {
      expand: ['data.price.product', 'data.discounts'],
    });
  }

  getCustomer(customerId: CustomerId) {
    return this.provider.customers.retrieve(customerId);
  }

  getProduct(productId: Stripe.Product['id']) {
    return this.provider.products.retrieve(productId);
  }

  async getCustomerIdByEmail(email: string) {
    const { data: customer } = await this.provider.customers.search({
      query: `email:'${email}'`,
    });
    const userExists = !!customer.length;

    if (!userExists) {
      throw new CustomerNotFoundError(email);
    }

    const customerId = customer[0].id;

    return {
      id: customerId,
    };
  }

  private validateInvoiceId(invoiceId: Invoice['id']): boolean {
    const regex = /^in_[a-zA-Z0-9]+$/;
    return regex.test(invoiceId);
  }

  async markInvoiceAsPaid(invoiceId: Invoice['id']): Promise<void> {
    const validInvoiceId = this.validateInvoiceId(invoiceId);

    if (!validInvoiceId) {
      throw new Error(`Invalid invoice id ${invoiceId}`);
    }

    await this.provider.invoices.pay(invoiceId, {
      paid_out_of_band: true,
    });
  }

  private async findIndividualActiveSubscription(customerId: CustomerId): Promise<Subscription> {
    const activeSubscriptions = await this.getActiveSubscriptions(customerId);

    const individualActiveSubscription = activeSubscriptions.find((subscription) => {
      const isNotBusiness = subscription.product?.metadata?.type !== 'business';
      const isNotObjectStorage = subscription.product?.metadata?.type !== 'object-storage';

      return isNotBusiness && isNotObjectStorage;
    });
    if (!individualActiveSubscription) {
      throw new NotFoundSubscriptionError('There is no individual subscription to update');
    }

    return individualActiveSubscription;
  }

  private async findBusinessActiveSubscription(customerId: CustomerId): Promise<Subscription> {
    const products = await this.productsRepository.findByType(UserType.Business);
    const businessProductIds = products.map((product) => product.paymentGatewayId);

    const activeSubscriptions = await this.getActiveSubscriptions(customerId);

    const businessSubscription = activeSubscriptions.find((subscription) =>
      businessProductIds.includes(subscription.items.data[0].price.product.toString()),
    );
    if (!businessSubscription) {
      throw new NotFoundSubscriptionError('There is no business subscription to update');
    }

    return businessSubscription;
  }

  private async findObjectStorageActiveSubscription(customerId: CustomerId): Promise<Subscription> {
    const activeSubscriptions = await this.getActiveSubscriptions(customerId);
    const objStorageSubscription = activeSubscriptions.find(
      (subscription) => (subscription as any).plan.product.metadata.type === UserType.ObjectStorage,
    );

    if (!objStorageSubscription) {
      throw new NotFoundSubscriptionError('There is no object storage subscription');
    }

    return objStorageSubscription;
  }

  private getMonthCount(intervalCount: number, timeInterval: string): number {
    const byTimeIntervalCalculator: any = {
      month: (): number => intervalCount,
      year: (): number => intervalCount * 12,
    };

    return byTimeIntervalCalculator[timeInterval]();
  }

  private getMonthlyAmount(totalPrice: number, intervalCount: number, timeInterval: string): number {
    const monthCount = this.getMonthCount(intervalCount, timeInterval);
    const monthlyPrice = totalPrice / monthCount;

    return monthlyPrice;
  }

  private getRenewalPeriod(intervalCount: number, interval: string): RenewalPeriod {
    let renewalPeriod = RenewalPeriod.Monthly;

    if (interval === 'month' && intervalCount === 6) {
      renewalPeriod = RenewalPeriod.Semiannually;
    } else if (interval === 'year') {
      renewalPeriod = RenewalPeriod.Annually;
    }

    return renewalPeriod;
  }

  async billCardVerificationCharge(customerId: string, currency: string, paymentMethodId?: PaymentMethod['id']) {
    const methods = paymentMethodId
      ? [
          {
            id: paymentMethodId,
          },
        ]
      : await this.getCustomerPaymentMethods(customerId);

    if (methods.length === 0) {
      throw new Error(`No payment methods found for customer ${customerId}`);
    }
    const [firstMethod] = methods;

    console.log(`Payment method ${firstMethod.id} found for customer ${customerId}`);

    const { data: charges } = await this.provider.charges.list({
      customer: customerId,
      limit: 100,
    });
    const oneTimeChargesWithThatPaymentMethod = charges.filter(
      (c) => c.paid && c.metadata.type === 'object-storage' && c.payment_method === firstMethod.id,
    );
    const paymentMethodAlreadyVerified = oneTimeChargesWithThatPaymentMethod.length > 0;

    if (paymentMethodAlreadyVerified) {
      console.info(`Payment method ${firstMethod.id} has been already verified, skipping one time charge`);
      return;
    }

    console.log(`Payment method ${firstMethod.id} is going to be charged in order to verify it`);

    await this.provider.paymentIntents.create({
      amount: 100,
      currency,
      metadata: {
        type: 'object-storage',
      },
      customer: customerId,
      description: 'Card verification charge',
      payment_method: firstMethod.id,
      off_session: true,
      confirm: true,
    });
  }

  getVatIdFromCountry(country: string): Stripe.TaxIdCreateParams.Type[] {
    const map: Record<string, Stripe.TaxIdCreateParams.Type[]> = {
      AD: ['ad_nrt'],
      AE: ['ae_trn'],
      AR: ['ar_cuit'],
      AU: ['au_abn', 'au_arn'],
      AT: ['eu_vat'],
      BG: ['bg_uic', 'eu_vat'],
      BH: ['bh_vat'],
      BE: ['eu_vat'],
      BO: ['bo_tin'],
      BR: ['br_cnpj', 'br_cpf'],
      CA: ['ca_bn', 'ca_gst_hst', 'ca_pst_bc', 'ca_pst_mb', 'ca_pst_sk', 'ca_qst'],
      CH: ['ch_vat'],
      CL: ['cl_tin'],
      CN: ['cn_tin'],
      CO: ['co_nit'],
      CR: ['cr_tin'],
      CY: ['eu_vat'],
      CZ: ['eu_vat'],
      DE: ['eu_vat'],
      DK: ['eu_vat'],
      DO: ['do_rcn'],
      EC: ['ec_ruc'],
      EG: ['eg_tin'],
      EE: ['eu_vat'],
      ES: ['es_cif', 'eu_vat'],
      EU: ['eu_oss_vat', 'eu_vat'],
      FI: ['eu_vat'],
      FR: ['eu_vat'],
      GE: ['ge_vat'],
      GR: ['eu_vat'],
      HK: ['hk_br'],
      HR: ['eu_vat'],
      HU: ['hu_tin', 'eu_vat'],
      ID: ['id_npwp'],
      IE: ['eu_vat'],
      IL: ['il_vat'],
      IN: ['in_gst'],
      IS: ['is_vat'],
      IT: ['eu_vat'],
      JP: ['jp_cn', 'jp_rn', 'jp_trn'],
      KE: ['ke_pin'],
      KR: ['kr_brn'],
      KZ: ['kz_bin'],
      LI: ['li_uid'],
      LT: ['eu_vat'],
      LU: ['eu_vat'],
      LV: ['eu_vat'],
      MX: ['mx_rfc'],
      MY: ['my_frp', 'my_itn', 'my_sst'],
      NG: ['ng_tin'],
      NL: ['eu_vat'],
      NO: ['no_vat', 'no_voec'],
      NZ: ['nz_gst'],
      OM: ['om_vat'],
      PE: ['pe_ruc'],
      PH: ['ph_tin'],
      PL: ['eu_vat'],
      PT: ['eu_vat'],
      RO: ['ro_tin', 'eu_vat'],
      RS: ['rs_pib'],
      RU: ['ru_inn', 'ru_kpp'],
      SA: ['sa_vat'],
      SG: ['sg_gst', 'sg_uen'],
      SI: ['si_tin', 'eu_vat'],
      SV: ['sv_nit'],
      SE: ['eu_vat'],
      TH: ['th_vat'],
      TR: ['tr_tin'],
      TW: ['tw_vat'],
      UA: ['ua_vat'],
      US: ['us_ein'],
      UY: ['uy_ruc'],
      VE: ['ve_rif'],
      VN: ['vn_tin'],
      ZA: ['za_vat'],
    };

    return map[country];
  }

  async attachTaxIdToCustomer(customerId: CustomerId, value: string, type: Stripe.TaxIdCreateParams.Type) {
    const customerTaxIds = await this.provider.customers.listTaxIds(customerId, {});
    const hasTaxIds = customerTaxIds.data.length > 0;

    if (hasTaxIds) {
      const isTaxIdAlreadyAttached = customerTaxIds.data.find((taxId) => taxId.value === value);

      if (isTaxIdAlreadyAttached) return;
    }

    await this.provider.customers.createTaxId(customerId, {
      type,
      value,
    });
  }

  async updateCustomer(
    customerId: Stripe.Customer['id'],
    updatableAttributes: {
      customer?: Partial<Pick<Stripe.CustomerUpdateParams, 'name'>>;
      tax?: {
        id: string;
        type: Stripe.TaxIdCreateParams.Type;
      };
    },
  ): Promise<void> {
    if (updatableAttributes.customer && Object.keys(updatableAttributes.customer).length > 0) {
      await this.provider.customers.update(customerId, {
        name: updatableAttributes.customer.name,
      });
    }
    if (updatableAttributes.tax) {
      await this.provider.taxIds.create({
        owner: {
          customer: customerId,
          type: 'customer',
        },

        type: updatableAttributes.tax.type,
        value: updatableAttributes.tax.id,
      });
    }
  }

  async getCustomerPaymentMethods(customerId: Stripe.Customer['id']): Promise<Stripe.PaymentMethod[]> {
    const res = await this.provider.paymentMethods.list({
      customer: customerId,
    });

    return res.data;
  }

  async getCryptoCurrencies() {
    const currencies = await this.bit2MeService.getCurrencies();

    return currencies.filter((c) => c.type === 'crypto');
  }
}

export class NotFoundSubscriptionError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, NotFoundSubscriptionError.prototype);
  }
}
export class CouponCodeError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, CouponCodeError.prototype);
  }
}

export class InvalidSeatNumberError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, InvalidSeatNumberError.prototype);
  }
}

export class IncompatibleSubscriptionTypesError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, IncompatibleSubscriptionTypesError.prototype);
  }
}
export class CustomerNotFoundError extends Error {
  constructor(email: string) {
    super(`Customer with email ${email} does not exist`);
    Object.setPrototypeOf(this, CustomerNotFoundError.prototype);
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
  constructor(priceId: string) {
    super(`Plan with an id ${priceId} does not exist`);

    Object.setPrototypeOf(this, NotFoundPlanByIdError.prototype);
  }
}

export class NotFoundPromoCodeByNameError extends Error {
  constructor(promoCodeId: string) {
    super(`Promotion code with an id ${promoCodeId} does not exist`);

    Object.setPrototypeOf(this, NotFoundPromoCodeByNameError.prototype);
  }
}

export class PromoCodeIsNotValidError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, PromoCodeIsNotValidError.prototype);
  }
}

export class ExistingSubscriptionError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, ExistingSubscriptionError.prototype);
  }
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User with email ${email} already exists.`);

    Object.setPrototypeOf(this, UserAlreadyExistsError.prototype);
  }
}

export class InvalidTaxIdError extends Error {
  constructor() {
    super('The provided Tax ID is invalid');

    Object.setPrototypeOf(this, InvalidTaxIdError.prototype);
  }
}

export class UpdateWorkspaceError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, UpdateWorkspaceError.prototype);
  }
}
