import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';
import config from '../../src/config';
import { User, UserSubscription, UserType } from '../../src/core/users/User';
import {
  PaymentIntent,
  PaymentIntentCrypto,
  PaymentIntentFiat,
  PromotionCode,
  RenewalPeriod,
  SubscriptionCreated,
} from '../../src/services/payment.service';
import { Coupon } from '../../src/core/coupons/Coupon';
import {
  CreateCryptoInvoicePayload,
  Currency,
  ParsedCreatedInvoiceResponse,
  ParsedInvoiceResponse,
  RawCreateInvoiceResponse,
  RawInvoiceResponse,
} from '../../src/services/bit2me.service';
import { Tier } from '../../src/core/users/Tier';
import { ObjectId } from 'mongodb';
import { LicenseCode } from '../../src/core/users/LicenseCode';
import { Bit2MePaymentStatusCallback } from '../../src/webhooks/providers/bit2me';
import { AllowedCryptoCurrencies } from '../../src/utils/currency';
import Stripe from 'stripe';

const randomDataGenerator = new Chance();

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export const getUser = (params?: Partial<User>): User => ({
  id: new ObjectId().toString(),
  uuid: randomUUID(),
  customerId: `cus_${randomDataGenerator.string({ length: 20 })}`,
  lifetime: false,
  ...params,
});

export const getLicenseCode = (params?: Partial<LicenseCode>) => {
  return {
    priceId: `price_${randomDataGenerator.string({ length: 16 })}`,
    provider: 'OWN',
    code: randomDataGenerator.string({ length: 10 }),
    redeemed: false,
    ...params,
  };
};

export const getCryptoInvoiceWebhook = (params?: Partial<Bit2MePaymentStatusCallback>): Bit2MePaymentStatusCallback => {
  return {
    id: randomDataGenerator.string({ length: 16 }),
    foreignId: `inv_${randomDataGenerator.string({ length: 16 })}`,
    cryptoAddress: {
      currency: AllowedCryptoCurrencies['Bitcoin'],
      address: randomDataGenerator.hash({ length: 34 }),
    },
    currencySent: {
      currency: AllowedCryptoCurrencies['Bitcoin'],
      amount: '0.01',
      remainingAmount: '0',
    },
    currencyReceived: {
      currency: AllowedCryptoCurrencies['Bitcoin'],
    },
    token: 'mocked-token',
    transactions: [],
    fees: [],
    error: [],
    status: 'paid',
    ...params,
  };
};

export const getValidAuthToken = (
  userUuid: string,
  workspaces?: {
    owners: string[];
  },
  params?: Partial<{
    email: string;
    uuid: string;
    name: string;
    lastname: string;
    username: string;
    sharedWorkspace: boolean;
    networkCredentials: {
      user: string;
    };
  }>,
): string => {
  return jwt.sign({ payload: { uuid: userUuid, workspaces, ...params } }, config.JWT_SECRET);
};

export const getValidUserToken = (payload: { customerId?: string; invoiceId?: string }): string => {
  return jwt.sign(payload, config.JWT_SECRET);
};

export const getCustomer = (params?: Partial<Stripe.Customer>): Stripe.Customer => {
  return {
    id: `cus_${randomDataGenerator.string({ length: 20 })}`,
    object: 'customer',
    address: {
      postal_code: '123456',
      country: 'ES',
      city: 'Valencia',
      line1: 'Avenida el Port',
      line2: 'Angels',
      state: 'Valencia',
    },
    balance: 0,
    created: 1680893993,
    currency: null,
    default_source: null,
    delinquent: false,
    description: null,
    discount: null,
    email: 'example@internxt.com',
    invoice_prefix: '0759376C',
    invoice_settings: {
      custom_fields: null,
      default_payment_method: null,
      footer: null,
      rendering_options: null,
    },
    livemode: false,
    metadata: {},
    name: 'My internxt',
    next_invoice_sequence: 1,
    phone: null,
    preferred_locales: [],
    shipping: null,
    tax_exempt: 'none',
    test_clock: null,
    ...params,
  };
};

export const getPromotionCodeResponse = (params?: Partial<PromotionCode>): PromotionCode => {
  return {
    codeId: 'promo_id',
    promoCodeName: 'PROMO_NAME',
    amountOff: null,
    percentOff: 75,
    ...params,
  };
};

export const getProduct = ({
  params,
  userType,
}: {
  params?: Partial<Stripe.Product>;
  userType?: UserType;
}): Stripe.Product => {
  return {
    id: `prod_${randomDataGenerator.string({ length: 12 })}`,
    type: 'service',
    object: 'product',
    active: true,
    created: 1678833149,
    default_price: null,
    description: null,
    images: [],
    marketing_features: [],
    livemode: false,
    metadata: {
      type: userType ?? UserType.Individual,
    },
    name: 'Gold Plan',
    package_dimensions: null,
    shippable: null,
    statement_descriptor: null,
    tax_code: null,
    unit_label: null,
    updated: 1678833149,
    url: null,
    ...params,
  };
};

export const getPrices = () => {
  return {
    subscription: {
      exists: 'price_1RQYKvFAOdcgaBMQfAYnxyMN',
      doesNotExist: 'price_1PLMerFAOdcgaBMQ17q27Cas',
    },
    lifetime: {
      exists: 'price_1RQYKvFAOdcgaBMQk7jdUope',
      doesNotExist: 'price_1PLMVCFAOdcgaBMQxIQgdXsds',
    },
  };
};

export const getTaxes = (params?: Partial<Stripe.Tax.Calculation>): Stripe.Tax.Calculation => {
  return {
    id: 'taxcalc_1RMT1aFAOdcgaBMQEoAm2Pee',
    object: 'tax.calculation',
    amount_total: 14505,
    currency: 'eur',
    customer: null,
    customer_details: {
      address: null,
      address_source: null,
      ip_address: '93.176.146.32',
      tax_ids: [],
      taxability_override: 'none',
    },
    expires_at: 1754481242,
    livemode: false,
    ship_from_details: null,
    shipping_cost: null,
    tax_amount_exclusive: 2517,
    tax_amount_inclusive: 0,
    tax_breakdown: [
      {
        amount: 2517,
        inclusive: false,
        tax_rate_details: {
          country: 'ES',
          percentage_decimal: '21',
          state: 'ES',
          tax_type: 'vat',
          flat_amount: {
            amount: 0,
            currency: 'EUR',
          },
          rate_type: 'flat_amount',
        },
        taxability_reason: 'standard_rated',
        taxable_amount: 11988,
      },
    ],
    tax_date: 1746705242,
    ...params,
  };
};

export const getPromoCode = (params?: DeepPartial<Stripe.PromotionCode>): Stripe.PromotionCode => {
  return {
    id: `promo_${randomDataGenerator.string({ length: 22 })}`,
    object: 'promotion_code',
    active: true,
    code: randomDataGenerator.string({ length: 10 }),
    coupon: {
      id: randomDataGenerator.string({ length: 10 }),
      object: 'coupon',
      amount_off: null,
      created: 1678040164,
      currency: null,
      duration: 'repeating',
      duration_in_months: 3,
      livemode: false,
      max_redemptions: null,
      metadata: {},
      name: null,
      percent_off: 25.5,
      redeem_by: null,
      times_redeemed: 0,
      valid: true,
    },
    created: 1678040164,
    customer: null,
    expires_at: null,
    livemode: false,
    max_redemptions: null,
    metadata: {},
    restrictions: {
      first_time_transaction: false,
      minimum_amount: null,
      minimum_amount_currency: null,
    },
    times_redeemed: 0,
    ...(params as any),
  };
};

export const priceById = ({
  bytes,
  interval,
  type = UserType.Individual,
  businessSeats,
  product,
}: {
  bytes: number;
  interval: 'lifetime' | 'year';
  type?: UserType;
  businessSeats?: {
    maxSeats: number;
    minSeats: number;
  };
  product?: string;
}) => {
  const mockedPrice = getPrice();
  return {
    id: mockedPrice.id,
    currency: mockedPrice.currency,
    amount: mockedPrice.currency_options![mockedPrice.currency].unit_amount as number,
    bytes,
    interval,
    decimalAmount: (mockedPrice.currency_options![mockedPrice.currency].unit_amount as number) / 100,
    type,
    product: product ?? (mockedPrice.product as string),
    ...businessSeats,
  };
};

export const getPrice = (params?: Partial<Stripe.Price>): Stripe.Price => {
  return {
    id: `price_${randomDataGenerator.string({ length: 12 })}`,
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: 1679431181,
    currency: 'eur',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: null,
    product: 'prod_NZKdYqrwEYx6iK',
    recurring: {
      meter: null,
      aggregate_usage: null,
      interval: 'month',
      interval_count: 1,
      trial_period_days: null,
      usage_type: 'licensed',
    },
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'recurring',
    unit_amount: 1000,
    unit_amount_decimal: '1000',
    currency_options: {
      eur: {
        tax_behavior: 'exclusive',
        unit_amount: 1000,
        custom_unit_amount: null,
        unit_amount_decimal: null,
      },
    },
    ...params,
  };
};

export const getCreateSubscriptionResponse = (params?: Partial<SubscriptionCreated>): SubscriptionCreated => {
  return {
    type: 'payment',
    clientSecret: `ci_${randomDataGenerator.string({ length: 8 })}`,
    ...params,
  };
};

export const getCreatedSubscription = (
  params?: Partial<Stripe.Subscription>,
  userType?: UserType,
): Stripe.Subscription => {
  const customer = `cus_${randomDataGenerator.string({ length: 20 })}`;
  const invoice = `in_${randomDataGenerator.string({ length: 14 })}`;

  return {
    id: `sub_${randomDataGenerator.string({ length: 14 })}`,
    object: 'subscription',
    billing_cycle_anchor_config: {
      day_of_month: 1,
      hour: 0,
      minute: 0,
      month: 1,
      second: 0,
    },
    invoice_settings: {
      account_tax_ids: null,
      issuer: 'Stripe' as any,
    },
    application: null,
    application_fee_percent: null,
    automatic_tax: {
      enabled: false,
      liability: null,
      disabled_reason: null,
    },
    billing_cycle_anchor: randomDataGenerator.natural({ length: 10 }),
    billing_thresholds: null,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    cancellation_details: {
      comment: null,
      feedback: null,
      reason: null,
    },
    collection_method: 'charge_automatically',
    created: randomDataGenerator.natural({ length: 10 }),
    currency: 'usd',
    current_period_end: randomDataGenerator.natural({ length: 10 }),
    current_period_start: randomDataGenerator.natural({ length: 10 }),
    customer,
    days_until_due: null,
    default_payment_method: {
      id: `pm_${randomDataGenerator.string({ length: 14 })}`,
      billing_details: {
        name: 'John Doe',
        address: randomDataGenerator.address() as any,
        email: randomDataGenerator.email(),
        phone: randomDataGenerator.phone(),
      },
      created: randomDataGenerator.natural({ length: 10 }),
      customer,
      livemode: false,
      metadata: {},
      object: 'payment_method',
      type: 'card',
    } as Stripe.PaymentMethod,
    billing_mode: {
      type: 'classic',
    },
    default_source: {
      id: `src_${randomDataGenerator.string({ length: 16 })}`,
      object: 'source',
      ach_credit_transfer: {
        account_number: 'test_eb829353ed79',
        bank_name: 'TEST BANK',
        fingerprint: 'kBQsBk9KtfCgjEYK',
        refund_account_holder_name: null,
        refund_account_holder_type: null,
        refund_routing_number: null,
        routing_number: '110000000',
        swift_code: 'TSTEZ122',
      },
      allow_redisplay: null,
      amount: null,
      client_secret: 'src_client_secret_ZaOIRUD8a9uGmQobLxGvqKSr',
      created: 1683144457,
      currency: 'usd',
      flow: 'receiver',
      livemode: false,
      metadata: {},
      owner: {
        address: null,
        email: 'jenny.rosen@example.com',
        name: null,
        phone: null,
        verified_address: null,
        verified_email: null,
        verified_name: null,
        verified_phone: null,
      },
      receiver: {
        address: '110000000-test_eb829353ed79',
        amount_charged: 0,
        amount_received: 0,
        amount_returned: 0,
        refund_attributes_method: 'email',
        refund_attributes_status: 'missing',
      },
      statement_descriptor: null,
      status: 'pending',
      type: 'ach_credit_transfer',
      usage: 'reusable',
    },
    default_tax_rates: [],
    description: null,
    discount: null,
    discounts: [
      {
        id: 'jMT0WJUD',
        checkout_session: '',
        coupon: 'jMT0WJUD' as any,
        customer: customer,
        invoice,
        invoice_item: invoice,
        end: 0,
        object: 'discount',
        start: 10,
        subscription: '',
        subscription_item: '',
        promotion_code: {
          id: `promo_${randomDataGenerator.string({ length: 22 })}`,
          object: 'promotion_code',
          active: true,
          code: 'PROMO_CODE',
          coupon: {
            id: 'jMT0WJUD',
            object: 'coupon',
            amount_off: null,
            created: 1678040164,
            currency: null,
            duration: 'repeating',
            duration_in_months: 3,
            livemode: false,
            max_redemptions: null,
            metadata: {},
            name: null,
            percent_off: 25.5,
            redeem_by: null,
            times_redeemed: 0,
            valid: true,
          },
          created: 1678040164,
          customer: null,
          expires_at: null,
          livemode: false,
          max_redemptions: null,
          metadata: {},
          restrictions: {
            first_time_transaction: false,
            minimum_amount: null,
            minimum_amount_currency: null,
          },
          times_redeemed: 0,
        },
      },
    ],
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${randomDataGenerator.string({ length: 12 })}`,
          current_period_end: randomDataGenerator.natural({ length: 10 }),
          current_period_start: randomDataGenerator.natural({ length: 10 }),
          object: 'subscription_item',
          billing_thresholds: null,
          created: randomDataGenerator.natural({ length: 10 }),
          metadata: {},
          discounts: null as any,
          plan: {
            meter: null,
            id: `price_${randomDataGenerator.string({ length: 20 })}`,
            object: 'plan',
            active: true,
            aggregate_usage: null,
            amount: 1000,
            amount_decimal: '1000',
            billing_scheme: 'per_unit',
            created: randomDataGenerator.natural({ length: 10 }),
            currency: 'usd',
            interval: 'month',
            interval_count: 1,
            livemode: false,
            metadata: {},
            nickname: null,
            product: {
              active: true,
              created: randomDataGenerator.natural({ length: 10 }),
              description: '',
              id: `prod_${randomDataGenerator.string({ length: 12 })}`,
              images: [],
              livemode: false,
              marketing_features: [],
              metadata: {
                type: `${userType}`,
              },
              name: '',
              object: 'product',
              package_dimensions: null,
              shippable: false,
              tax_code: '',
              type: 'service',
              updated: randomDataGenerator.natural({ length: 10 }),
              url: '',
            },
            tiers_mode: null,
            transform_usage: null,
            trial_period_days: null,
            usage_type: 'licensed',
          },
          price: {
            id: `price_${randomDataGenerator.string({ length: 12 })}`,
            object: 'price',
            active: true,
            billing_scheme: 'per_unit',
            created: randomDataGenerator.natural({ length: 10 }),
            currency: 'usd',
            custom_unit_amount: null,
            livemode: false,
            lookup_key: null,
            metadata: {},
            nickname: null,
            product: `prod_${randomDataGenerator.string({ length: 12 })}`,
            recurring: {
              meter: null,
              aggregate_usage: null,
              interval: 'month',
              interval_count: 1,
              trial_period_days: null,
              usage_type: 'licensed',
            },
            tax_behavior: 'unspecified',
            tiers_mode: null,
            transform_quantity: null,
            type: 'recurring',
            unit_amount: 1000,
            unit_amount_decimal: '1000',
          },
          quantity: 1,
          subscription: `sub_${randomDataGenerator.string({ length: 12 })}`,
          tax_rates: [],
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '/v1/subscription_items?subscription=sub_1MowQVLkdIwHu7ixeRlqHVzs',
    },
    latest_invoice: `in_${randomDataGenerator.string({ length: 14 })}`,
    livemode: false,
    metadata: {},
    next_pending_invoice_item_invoice: null,
    on_behalf_of: null,
    pause_collection: null,
    payment_settings: {
      payment_method_options: null,
      payment_method_types: null,
      save_default_payment_method: 'off',
    },
    pending_invoice_item_interval: null,
    pending_setup_intent: null,
    pending_update: null,
    schedule: null,
    start_date: randomDataGenerator.natural({ length: 10 }),
    status: 'active',
    test_clock: null,
    transfer_data: null,
    trial_end: null,
    trial_settings: {
      end_behavior: {
        missing_payment_method: 'create_invoice',
      },
    },
    trial_start: null,
    ...params,
  };
};

export function getSubscription({
  type = 'subscription',
  userType = UserType.Individual,
  seats,
}: {
  type: 'free' | 'subscription' | 'lifetime';
  userType?: UserType;
  seats?: { minimumSeats: number; maximumSeats: number };
}): UserSubscription {
  const availableSeats = seats ? seats : undefined;
  return {
    type,
    subscriptionId: `sub_${randomDataGenerator.string({ length: 14 })}`,
    amount: 11988,
    currency: 'eur',
    interval: 'year',
    nextPayment: 1774631776,
    amountAfterCoupon: 0,
    priceId: `price_${randomDataGenerator.string({ length: 12 })}`,
    productId: `prod_${randomDataGenerator.string({ length: 8 })}`,
    userType,
    plan: {
      simpleName: 'Essential',
      status: 'active',
      planId: `price_${randomDataGenerator.string({ length: 12 })}`,
      productId: `prod_${randomDataGenerator.string({ length: 10 })}`,
      name: 'Essential',
      type: userType,
      price: 119.88,
      monthlyPrice: 9.99,
      currency: 'eur',
      isTeam: false,
      paymentInterval: '',
      isLifetime: false,
      renewalPeriod: RenewalPeriod.Annually,
      storageLimit: 1099511627776,
      amountOfSeats: 1,
      ...availableSeats,
    },
  };
}

export const getActiveSubscriptions = (
  count: number = 1,
  paramsArray: Partial<Stripe.Subscription>[] = [],
): Stripe.Subscription[] => {
  return Array.from({ length: count }, (_, index) => ({
    ...getCreatedSubscription(),
    ...paramsArray[index],
  }));
};

export function getPaymentIntentResponse(params: Partial<PaymentIntentFiat>): PaymentIntentFiat;
export function getPaymentIntentResponse(params: Partial<PaymentIntentCrypto>): PaymentIntentCrypto;
export function getPaymentIntentResponse(params: Partial<PaymentIntent>): PaymentIntent {
  if (params.type === 'crypto') {
    const cryptoParams = params as Partial<PaymentIntentCrypto>;
    return {
      id: cryptoParams.id ?? 'crypto-id',
      type: 'crypto',
      token: 'encoded-invoice-id',
      payload: {
        paymentRequestUri: 'mock-address',
        url: 'https://mock.crypto.url',
        qrUrl: 'https://mock.qr.url',
        payAmount: cryptoParams.payload?.payAmount ?? 0.01,
        payCurrency: cryptoParams.payload?.payCurrency ?? 'BTC',
        paymentAddress: cryptoParams.payload?.paymentAddress ?? 'mock-address',
      },
    };
  }

  const fiatParams = params as Partial<PaymentIntentFiat>;
  return {
    id: fiatParams.id ?? 'fiat-id',
    type: 'fiat',
    clientSecret: fiatParams.clientSecret ?? 'client_secret',
    invoiceStatus: fiatParams.invoiceStatus ?? 'open',
  };
}

export function getRawCreateInvoiceResponse(params: Partial<RawCreateInvoiceResponse> = {}): RawCreateInvoiceResponse {
  return {
    invoiceId: randomDataGenerator.guid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
    foreignId: randomDataGenerator.string({ length: 16 }),
    priceAmount: randomDataGenerator.floating({ min: 5, max: 100, fixed: 2 }).toString(),
    priceCurrency: 'EUR',
    status: 'pending',
    customerEmail: randomDataGenerator.email(),
    receiveCurrencyName: 'Bitcoin',
    title: randomDataGenerator.sentence({ words: 4 }),
    description: randomDataGenerator.sentence(),
    successUrl: `${config.DRIVE_WEB_URL}/checkout/success`,
    cancelUrl: `${config.DRIVE_WEB_URL}/checkout/cancel`,
    paymentAddress: randomDataGenerator.hash({ length: 34 }),
    paymentRequestUri: `bitcoin:${randomDataGenerator.hash({ length: 34 })}?amount=${randomDataGenerator.floating({
      min: 5,
      max: 100,
      fixed: 2,
    })}`,
    payAmount: randomDataGenerator.floating({ min: 5, max: 100, fixed: 2 }),
    payCurrency: 'BTC',
    merchant: {
      merchantId: randomDataGenerator.guid(),
      name: 'Internxt',
    },
    url: `https://checkout.internxt.com/invoice/${randomDataGenerator.guid()}`,
    ...params,
  };
}

export function getParsedInvoiceResponse(params: Partial<ParsedInvoiceResponse> = {}): ParsedInvoiceResponse {
  return {
    invoiceId: randomDataGenerator.guid(),
    createdAt: new Date(),
    updatedAt: new Date(),
    expiredAt: new Date(Date.now() + 3600000),
    paidAt: null,
    foreignId: randomDataGenerator.string({ length: 16 }),
    priceAmount: randomDataGenerator.floating({ min: 10, max: 100 }),
    underpaidAmount: 0,
    overpaidAmount: 0,
    priceCurrency: 'EUR',
    status: 'pending',
    customerEmail: randomDataGenerator.email(),
    receiveCurrencyName: 'Bitcoin',
    title: 'Mock Invoice',
    description: 'Mock description',
    successUrl: 'https://mock/success',
    cancelUrl: 'https://mock/cancel',
    paymentAddress: randomDataGenerator.hash({ length: 34 }),
    paymentRequestUri: 'bitcoin:address?amount=0.01',
    payAmount: 0.01,
    payCurrency: 'BTC',
    merchant: {
      merchantId: randomDataGenerator.guid(),
      name: 'Internxt',
    },
    url: 'https://mock.crypto.url',
    ...params,
  };
}

export function getParsedCreatedInvoiceResponse(
  params: Partial<ParsedCreatedInvoiceResponse> = {},
  rawInvoiceResponse?: RawInvoiceResponse,
): ParsedCreatedInvoiceResponse {
  const raw = rawInvoiceResponse ?? getRawCreateInvoiceResponse();

  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    priceAmount: parseFloat(raw.priceAmount),
    ...params,
  };
}

export const getPaymentIntent = (params?: Partial<Stripe.PaymentIntent>): Stripe.PaymentIntent => {
  return {
    id: `pi_${randomDataGenerator.string({ length: 14 })}`,
    invoice: `in_${randomDataGenerator.string({ length: 14 })}`,
    excluded_payment_method_types: [],
    payment_method_configuration_details: {
      id: '',
      parent: '',
    },
    object: 'payment_intent',
    amount: 2000,
    amount_capturable: 0,
    amount_details: {
      tip: {},
    },
    amount_received: 0,
    application: null,
    application_fee_amount: null,
    automatic_payment_methods: {
      enabled: true,
    },
    canceled_at: null,
    cancellation_reason: null,
    capture_method: 'automatic',
    client_secret: `pi_${randomDataGenerator.string({ length: 24 })}`,
    confirmation_method: 'automatic',
    created: 1680800504,
    currency: 'usd',
    customer: null,
    description: null,
    last_payment_error: null,
    latest_charge: null,
    livemode: false,
    metadata: {},
    next_action: null,
    on_behalf_of: null,
    payment_method: null,
    payment_method_options: {
      card: {
        installments: null,
        mandate_options: null,
        network: null,
        request_three_d_secure: 'automatic',
      },
      link: {
        persistent_token: null,
      },
    },
    payment_method_types: ['card', 'link'],
    processing: null,
    receipt_email: null,
    review: null,
    setup_future_usage: null,
    shipping: null,
    source: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'requires_payment_method',
    transfer_data: null,
    transfer_group: null,
    ...params,
  };
};

export const getCoupon = (params?: Partial<Coupon>): Coupon => ({
  id: new ObjectId().toString(),
  provider: 'stripe',
  code: 'c0UP0n',
  ...params,
});

export const newTier = (params?: Partial<Tier>): Tier => {
  return {
    id: randomDataGenerator.string({ length: 10 }),
    billingType: 'subscription',
    label: 'test-label',
    productId: `prod_${randomDataGenerator.string({ length: 15 })}`,
    featuresPerService: {
      mail: { enabled: false, addressesPerUser: randomDataGenerator.integer({ min: 0, max: 5 }) },
      meet: { enabled: false, paxPerCall: randomDataGenerator.integer({ min: 0, max: 5 }) },
      vpn: { enabled: false, featureId: randomDataGenerator.string({ length: 10 }) },
      antivirus: { enabled: false },
      backups: { enabled: false },
      cleaner: { enabled: false },
      drive: {
        enabled: false,
        maxSpaceBytes: randomDataGenerator.integer({ min: 1024 * 1024 * 1024, max: 5 * 1024 * 1024 * 1024 }),
        workspaces: {
          enabled: false,
          maximumSeats: randomDataGenerator.integer({ min: 10, max: 100 }),
          minimumSeats: 3,
          maxSpaceBytesPerSeat: randomDataGenerator.integer({ min: 1024 * 1024 * 1024, max: 5 * 1024 * 1024 * 1024 }),
        },
      },
    },
    ...params,
  };
};

export const getLogger = (): jest.Mocked<FastifyBaseLogger> => {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    level: 'info',
    silent: jest.fn(),
    child: jest.fn(),
  };
};

export const getPayloadForCryptoInvoice = (
  params?: Partial<CreateCryptoInvoicePayload>,
): CreateCryptoInvoicePayload => {
  const payload = {
    foreignId: 'invoice-123',
    priceAmount: 100,
    priceCurrency: AllowedCryptoCurrencies['Bitcoin'],
    title: 'Test Invoice',
    description: 'Payment for product',
    successUrl: 'https://success.url',
    cancelUrl: 'https://cancel.url',
    purchaserEmail: 'test@internxt.com',
    securityToken: 'secure-token',
    ...params,
  };

  return payload;
};

export const getRawCryptoInvoiceResponse = (params?: Partial<RawInvoiceResponse>): RawInvoiceResponse => {
  const now = new Date();

  const rawResponse = {
    invoiceId: randomUUID(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiredAt: new Date(now.getTime() + 100000).toISOString(),
    paidAt: null,
    foreignId: 'foreign-123',
    priceAmount: '99.99',
    priceCurrency: 'EUR',
    status: 'waitingPayment',
    customerEmail: 'test@example.com',
    receiveCurrencyName: 'BTC',
    title: 'Test Invoice',
    description: 'Test invoice description',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    underpaidAmount: '0.00',
    overpaidAmount: '0.00',
    paymentAddress: 'bc1address',
    paymentRequestUri: 'bitcoin:bc1address?amount=0.001',
    payAmount: 0.001,
    payCurrency: 'BTC',
    merchant: {
      merchantId: 'merchant-1',
      name: 'Internxt',
    },
    url: 'https://bit2me.com/checkout-url',
    ...params,
  };

  return rawResponse;
};

export const getCryptoCurrency = (params?: Partial<Currency>): Currency => ({
  currencyId: AllowedCryptoCurrencies['Bitcoin'],
  name: 'Bitcoin',
  type: 'crypto',
  receiveType: true,
  networks: [
    {
      platformId: 'bitcoin-mainnet',
      name: 'Bitcoin Network',
    },
    {
      platformId: 'lightning',
      name: 'Lightning Network',
    },
  ],
  imageUrl: 'https://example.com/icons/btc.svg',
  ...params,
});

export const getInvoice = (
  params?: DeepPartial<Partial<Stripe.Invoice>>,
  userType = UserType.Individual,
  productId?: string,
): Stripe.Invoice => {
  return {
    id: 'in_eir9242',
    object: 'invoice',
    effective_at: 0,
    rendering: null,
    subscription_details: {
      metadata: {},
    },
    account_country: 'US',
    account_name: 'Stripe Docs',
    account_tax_ids: null,
    amount_due: 0,
    amount_paid: 0,
    amount_remaining: 0,
    amount_shipping: 0,
    application: null,
    application_fee_amount: null,
    attempt_count: 0,
    attempted: false,
    auto_advance: false,
    automatic_tax: {
      enabled: false,
      liability: null,
      status: null,
    },
    billing_reason: 'manual',
    charge: null,
    collection_method: 'charge_automatically',
    created: randomDataGenerator.natural({ length: 10 }),
    currency: 'usd',
    custom_fields: null,
    customer: `cus_${randomDataGenerator.string({ length: 20 })}`,
    customer_address: null,
    customer_email: 'example@internxt.com',
    customer_name: 'My internxt',
    customer_phone: null,
    customer_shipping: null,
    customer_tax_exempt: 'none',
    customer_tax_ids: [],
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discount: null,
    discounts: [],
    due_date: null,
    ending_balance: null,
    footer: null,
    from_invoice: null,
    hosted_invoice_url: null,
    invoice_pdf: null,
    issuer: {
      type: 'self',
    },
    last_finalization_error: null,
    latest_revision: null,
    lines: {
      object: 'list',
      data: [
        {
          id: 'il_tmp_1Nzo1ZGgdF1VjufLzD1UUn9R',
          object: 'line_item',
          invoice: '',
          amount: 1000,
          amount_excluding_tax: 1000,
          currency: 'usd',
          description: 'My First Invoice Item (created for API docs)',
          discount_amounts: [],
          discountable: true,
          discounts: [],
          invoice_item: 'ii_1Nzo1ZGgdF1VjufLzD1UUn9R',
          livemode: false,
          metadata: {},
          period: {
            end: 1696975413,
            start: 1696975413,
          },
          plan: {
            id: `price_${randomDataGenerator.string({ length: 20 })}`,
            object: 'plan',
            active: true,
            aggregate_usage: null,
            amount: 1000,
            amount_decimal: '1000',
            billing_scheme: 'per_unit',
            created: randomDataGenerator.natural({ length: 10 }),
            currency: 'usd',
            interval: 'month',
            interval_count: 1,
            livemode: false,
            metadata: {},
            nickname: null,
            product: `prod_${randomDataGenerator.string({ length: 15 })}`,
            tiers_mode: null,
            transform_usage: null,
            trial_period_days: null,
            usage_type: 'licensed',
          },
          price: {
            id: `price_${randomDataGenerator.string({ length: 12 })}`,
            object: 'price',
            active: true,
            billing_scheme: 'per_unit',
            created: randomDataGenerator.natural({ length: 10 }),
            currency: 'usd',
            custom_unit_amount: null,
            livemode: false,
            lookup_key: null,
            metadata: {
              maxSpaceBytes: `${randomDataGenerator.natural({ length: 8 })}`,
              type: userType as string,
            },
            nickname: null,
            product: {
              id: productId ?? `prod_${randomDataGenerator.string({ length: 12 })}`,
              type: 'service',
              object: 'product',
              active: true,
              created: 1678833149,
              default_price: null,
              description: null,
              images: [],
              marketing_features: [],
              livemode: false,
              metadata: {
                type: userType,
              },
              name: 'Gold Plan',
              package_dimensions: null,
              shippable: null,
              statement_descriptor: null,
              tax_code: null,
              unit_label: null,
              updated: 1678833149,
              url: null,
            },
            recurring: {
              aggregate_usage: null,
              interval: 'month',
              interval_count: 1,
              trial_period_days: null,
              usage_type: 'licensed',
            },
            tax_behavior: 'unspecified',
            tiers_mode: null,
            transform_quantity: null,
            type: 'recurring',
            unit_amount: 1000,
            unit_amount_decimal: '1000',
          },
          proration: false,
          proration_details: {
            credited_items: null,
          },
          quantity: 1,
          subscription: null,
          tax_amounts: [],
          tax_rates: [],
          type: 'invoiceitem',
          unit_amount_excluding_tax: '1000',
        },
      ],
      has_more: false,
      url: '/v1/invoices/in_1MtHbELkdIwHu7ixl4OzzPMv/lines',
    },
    livemode: false,
    metadata: {},
    next_payment_attempt: null,
    number: null,
    on_behalf_of: null,
    paid: false,
    paid_out_of_band: false,
    payment_intent: null,
    payment_settings: {
      default_mandate: null,
      payment_method_options: null,
      payment_method_types: null,
    },
    period_end: randomDataGenerator.natural({ length: 10 }),
    period_start: randomDataGenerator.natural({ length: 10 }),
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    quote: null,
    receipt_number: null,
    shipping_cost: null,
    shipping_details: null,
    starting_balance: 0,
    statement_descriptor: null,
    status: 'draft',
    status_transitions: {
      finalized_at: null,
      marked_uncollectible_at: null,
      paid_at: null,
      voided_at: null,
    },
    subscription: null,
    subtotal: 0,
    subtotal_excluding_tax: 0,
    tax: null,
    test_clock: null,
    total: 0,
    total_discount_amounts: [],
    total_excluding_tax: 0,
    total_tax_amounts: [],
    transfer_data: null,
    webhooks_delivered_at: randomDataGenerator.natural({ length: 10 }),
    ...(params as any),
  };
};

export function getInvoices(count = 2, paramsArray: DeepPartial<Stripe.Invoice>[] = []): Stripe.Invoice[] {
  return Array.from({ length: count }, (_, index) => ({
    ...getInvoice(),
    ...(paramsArray[index] as any),
  }));
}

export function getUniqueCodes() {
  return {
    techCult: {
      codes: {
        elegible: '5tb_redeem_code',
        nonElegible: '2tb_code_redeem',
        doesntExist: 'doesnt_exist',
      },
      provider: 'TECHCULT',
    },
    stackCommerce: {
      codes: {
        elegible: '5tb_redeem_code',
        nonElegible: '2tb_code_redeem',
        doesntExist: 'doesnt_exist',
      },
      provider: 'STACKCOMMERCE',
    },
  };
}

export function getCharge(params?: Partial<Stripe.Charge>): Stripe.Charge {
  return {
    id: `ch_${randomDataGenerator.string({ length: 10 })}`,
    source: '' as any,
    object: 'charge',
    amount: 1099,
    amount_captured: 1099,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: `txn_${randomDataGenerator.string({ length: 10 })}`,
    billing_details: {
      tax_id: null,
      address: {
        city: null,
        country: null,
        line1: null,
        line2: null,
        postal_code: null,
        state: null,
      },
      email: null,
      name: null,
      phone: null,
    },
    calculated_statement_descriptor: 'Stripe',
    captured: true,
    created: randomDataGenerator.natural({ length: 10 }),
    currency: 'usd',
    customer: `cus_${randomDataGenerator.string({ length: 20 })}`,
    description: null,
    disputed: false,
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    fraud_details: {},
    invoice: `in_${randomDataGenerator.string({ length: 16 })}`,
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    outcome: {
      advice_code: null,
      network_advice_code: null,
      network_decline_code: null,
      network_status: 'approved_by_network',
      reason: null,
      risk_level: 'normal',
      risk_score: 32,
      seller_message: 'Payment complete.',
      type: 'authorized',
    },
    paid: true,
    payment_intent: null,
    payment_method: `card_${randomDataGenerator.string({ length: 10 })}`,
    payment_method_details: {
      card: {
        network_transaction_id: null,
        regulated_status: null,
        authorization_code: null,
        amount_authorized: 0,
        brand: 'visa',
        checks: {
          address_line1_check: null,
          address_postal_code_check: null,
          cvc_check: null,
        },
        country: 'US',
        exp_month: 3,
        exp_year: 2024,
        fingerprint: randomDataGenerator.string({ length: 10 }),
        funding: 'credit',
        installments: null,
        last4: '4242',
        mandate: null,
        network: 'visa',
        three_d_secure: null,
        wallet: null,
      },
      type: 'card',
    },
    receipt_email: 'example@inxt.com',
    receipt_number: null,
    receipt_url:
      'https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xTTJKVGtMa2RJd0h1N2l4KOvG06AGMgZfBXyr1aw6LBa9vaaSRWU96d8qBwz9z2J_CObiV_H2-e8RezSK_sw0KISesp4czsOUlVKY',
    refunded: false,
    review: null,
    shipping: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer_data: null,
    transfer_group: null,
    ...params,
  };
}

export function getDispute(params?: Partial<Stripe.Dispute>): Stripe.Dispute {
  return {
    id: 'du_1MtJUT2eZvKYlo2CNaw2HvEv',
    object: 'dispute',
    amount: 1000,
    balance_transactions: [],
    charge: `ch_${randomDataGenerator.string({ length: 16 })}`,
    created: 1680651737,
    currency: 'usd',
    enhanced_eligibility_types: [],
    evidence: {
      enhanced_evidence: {},
      access_activity_log: null,
      billing_address: null,
      cancellation_policy: null,
      cancellation_policy_disclosure: null,
      cancellation_rebuttal: null,
      customer_communication: null,
      customer_email_address: null,
      customer_name: null,
      customer_purchase_ip: null,
      customer_signature: null,
      duplicate_charge_documentation: null,
      duplicate_charge_explanation: null,
      duplicate_charge_id: null,
      product_description: null,
      receipt: null,
      refund_policy: null,
      refund_policy_disclosure: null,
      refund_refusal_explanation: null,
      service_date: null,
      service_documentation: null,
      shipping_address: null,
      shipping_carrier: null,
      shipping_date: null,
      shipping_documentation: null,
      shipping_tracking_number: null,
      uncategorized_file: null,
      uncategorized_text: null,
    },
    evidence_details: {
      enhanced_eligibility: {},
      due_by: 1682294399,
      has_evidence: false,
      past_due: false,
      submission_count: 0,
    },
    is_charge_refundable: true,
    livemode: false,
    metadata: {},
    payment_intent: null,
    reason: 'general',
    status: 'lost',
    ...params,
  };
}

export const getCurrency = (params?: Partial<Currency>): Currency => {
  return {
    currencyId: 'BTC',
    name: 'Bitcoin',
    type: 'crypto',
    receiveType: true,
    networks: [
      {
        platformId: 'bitcoin',
        name: 'bitcoin',
      },
    ],
    imageUrl: 'https://some-image.jpg',
    ...params,
  };
};

export const getCurrencies = (count = 2, paramsArray: Partial<Currency>[] = []): Currency[] => {
  return Array.from({ length: count }, (_, index) => ({
    ...getCurrency(),
    ...paramsArray[index],
  }));
};

export const getPaymentMethod = (params?: Partial<Stripe.PaymentMethod>): Stripe.PaymentMethod => {
  return {
    id: 'pm_1Q0PsIJvEtkwdCNYMSaVuRz6',
    object: 'payment_method',
    allow_redisplay: 'unspecified',
    billing_details: {
      tax_id: null,
      address: {
        city: null,
        country: null,
        line1: null,
        line2: null,
        postal_code: null,
        state: null,
      },
      email: null,
      name: 'John Doe',
      phone: null,
    },
    created: 1726673582,
    customer: null,
    livemode: false,
    metadata: {},
    type: 'us_bank_account',
    us_bank_account: {
      account_holder_type: 'individual',
      account_type: 'checking',
      bank_name: 'STRIPE TEST BANK',
      financial_connections_account: null,
      fingerprint: 'LstWJFsCK7P349Bg',
      last4: '6789',
      networks: {
        preferred: 'ach',
        supported: ['ach'],
      },
      routing_number: '110000000',
      status_details: {},
    },
    ...params,
  };
};

export const voidPromise = () => Promise.resolve();

export const mockCalculateTaxFor = (amount: number, taxRate = 0.21) => {
  const tax = Math.floor(amount * taxRate);
  return {
    tax_amount_exclusive: tax,
    amount_total: amount + tax,
  };
};
