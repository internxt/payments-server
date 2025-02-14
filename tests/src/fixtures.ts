import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';
import config from '../../src/config';
import { User } from '../../src/core/users/User';
import { Tier } from '../../src/core/users/MongoDBTiersRepository';
import Stripe from 'stripe';
import { PaymentIntent, PromotionCode, SubscriptionCreated } from '../../src/services/payment.service';
import { Coupon } from '../../src/core/coupons/Coupon';

const randomDataGenerator = new Chance();

export const getUser = (params?: Partial<User>): User => ({
  id: randomDataGenerator.string({ length: 12 }),
  uuid: randomUUID(),
  customerId: `cus_${randomDataGenerator.string({ length: 10 })}`,
  lifetime: false,
  ...params,
});

export const getValidToken = (userUuid: string): string => {
  return jwt.sign({ payload: { uuid: userUuid } }, config.JWT_SECRET);
};

export const mockCustomerPayload = (params?: Partial<Stripe.Customer>): Stripe.Customer => {
  return {
    id: `cus_${randomDataGenerator.string({ length: 12 })}`,
    object: 'customer',
    address: null,
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

export const mockPromotionCode = (params: Partial<PromotionCode>): PromotionCode => {
  return {
    codeId: 'promo_id',
    promoCodeName: 'PROMO_NAME',
    amountOff: null,
    percentOff: 75,
    ...params,
  };
};

export const mockPrices = () => {
  return {
    subscription: {
      exists: 'price_1PLMh8FAOdcgaBMQlZcGAPY4',
      doesNotExist: 'price_1PLMerFAOdcgaBMQ17q27Cas',
    },
    lifetime: {
      exists: 'price_1PLMTpFAOdcgaBMQ0Jag685H',
      doesNotExist: 'price_1PLMVCFAOdcgaBMQxIQgdXsds',
    },
  };
};

export const mockCreateSubscriptionResponse = (params?: Partial<SubscriptionCreated>): SubscriptionCreated => {
  return {
    type: 'payment',
    clientSecret: `ci_${randomDataGenerator.string({ length: 8 })}`,
    ...params,
  };
};

export const createdSubscription = (params?: Partial<Stripe.Subscription>): Stripe.Subscription => {
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
    customer: `cus_${randomDataGenerator.string({ length: 12 })}`,
    days_until_due: null,
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discount: null,
    discounts: null as any,
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${randomDataGenerator.string({ length: 12 })}`,
          object: 'subscription_item',
          billing_thresholds: null,
          created: randomDataGenerator.natural({ length: 10 }),
          metadata: {},
          discounts: null as any,
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
            metadata: {},
            nickname: null,
            product: `prod_${randomDataGenerator.string({ length: 12 })}`,
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
          quantity: 1,
          subscription: `sub_${randomDataGenerator.string({ length: 12 })}`,
          tax_rates: [],
        },
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

export const mockActiveSubscriptions = (
  count: number = 1,
  paramsArray: Partial<Stripe.Subscription>[] = [],
): Stripe.Subscription[] => {
  return Array.from({ length: count }, (_, index) => ({
    ...createdSubscription(),
    ...paramsArray[index],
  }));
};

export const mockPaymentIntentResponse = (params?: Partial<PaymentIntent>): PaymentIntent => {
  return {
    id: `pi_${randomDataGenerator.string({ length: 10 })}`,
    clientSecret: 'client_secret',
    invoiceStatus: 'open',
    ...params,
  };
};

export const mockCoupon = (params?: Partial<Coupon>): Coupon => ({
  id: randomUUID(),
  provider: 'stripe',
  code: 'c0UP0n',
  ...params,
});

export const newTier = (params?: Partial<Tier>): Tier => {
  return {
    billingType: 'subscription',
    label: 'test-label',
    productId: randomDataGenerator.string({ length: 15 }),
    featuresPerService: {
      mail: { enabled: false, addressesPerUser: randomDataGenerator.integer({ min: 0, max: 5 }) },
      meet: { enabled: false, paxPerCall: randomDataGenerator.integer({ min: 0, max: 5 }) },
      vpn: { enabled: false, locationsAvailable: randomDataGenerator.integer({ min: 0, max: 5 }) },
      antivirus: { enabled: false },
      backups: { enabled: false },
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

export const mockLogger = (): jest.Mocked<FastifyBaseLogger> => {
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
