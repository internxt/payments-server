import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';
import config from '../../src/config';
import { User, UserSubscription, UserType } from '../../src/core/users/User';
import { Tier } from '../../src/core/users/MongoDBTiersRepository';
import Stripe from 'stripe';
import { PaymentIntent, PromotionCode, RenewalPeriod, SubscriptionCreated } from '../../src/services/payment.service';
import { Coupon } from '../../src/core/coupons/Coupon';
import { Currency } from '../../src/services/bit2me.service';

const randomDataGenerator = new Chance();

export const getUser = (params?: Partial<User>): User => ({
  id: randomDataGenerator.string({ length: 12 }),
  uuid: randomUUID(),
  customerId: `cus_${randomDataGenerator.string({ length: 20 })}`,
  lifetime: false,
  ...params,
});

export const getValidToken = (userUuid: string): string => {
  return jwt.sign({ payload: { uuid: userUuid } }, config.JWT_SECRET);
};

export const getCustomer = (params?: Partial<Stripe.Customer>): Stripe.Customer => {
  return {
    id: `cus_${randomDataGenerator.string({ length: 20 })}`,
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

export const getPromotionCode = (params?: Partial<PromotionCode>): PromotionCode => {
  return {
    codeId: 'promo_id',
    promoCodeName: 'PROMO_NAME',
    amountOff: null,
    percentOff: 75,
    ...params,
  };
};

export const getPrices = () => {
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

export const getActiveSubscriptions = (
  count: number = 1,
  paramsArray: Partial<Stripe.Subscription>[] = [],
): Stripe.Subscription[] => {
  return Array.from({ length: count }, (_, index) => ({
    ...getCreatedSubscription(),
    ...paramsArray[index],
  }));
};

export const getPaymentIntentResponse = (params?: Partial<PaymentIntent>): PaymentIntent => {
  return {
    id: `pi_${randomDataGenerator.string({ length: 10 })}`,
    clientSecret: 'client_secret',
    invoiceStatus: 'open',
    ...params,
  };
};

export const getCoupon = (params?: Partial<Coupon>): Coupon => ({
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

export const getInvoice = (params?: Partial<Stripe.Invoice>, userType?: UserType): Stripe.Invoice => {
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
          id: `il_tmp_${randomDataGenerator.string({ length: 14 })}`,
          object: 'line_item',
          invoice: '',
          amount: 1000,
          amount_excluding_tax: 1000,
          currency: 'usd',
          description: 'My First Invoice Item (created for API docs)',
          discount_amounts: [],
          discountable: true,
          discounts: [],
          invoice_item: `ii_${randomDataGenerator.string({ length: 14 })}`,
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
    ...params,
  };
};

export function getInvoices(count = 2, paramsArray: Partial<Stripe.Invoice>[] = []): Stripe.Invoice[] {
  return Array.from({ length: count }, (_, index) => ({
    ...getInvoice(),
    ...paramsArray[index],
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
    receipt_email: null,
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
    evidence: {
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
    id: `pm_${randomDataGenerator.string({ length: 14 })}`,
    object: 'payment_method',
    allow_redisplay: 'unspecified',
    billing_details: {
      address: {
        city: null,
        country: null,
        line1: null,
        line2: null,
        postal_code: null,
        state: null,
      },
      email: randomDataGenerator.email(),
      name: randomDataGenerator.name(),
      phone: randomDataGenerator.phone(),
    },
    created: randomDataGenerator.natural({ length: 10 }),
    customer: null,
    livemode: false,
    metadata: {},
    type: 'us_bank_account',
    us_bank_account: {
      account_holder_type: 'individual',
      account_type: 'checking',
      bank_name: 'STRIPE TEST BANK',
      financial_connections_account: null,
      fingerprint: randomDataGenerator.string({ length: 12 }),
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

export const getInvoiceLineItem = (
  objParams?: Partial<Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>>,
  lineItemParams?: Partial<Stripe.InvoiceLineItem>,
): Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>> => {
  return {
    object: 'list',
    url: '/v1/invoices',
    has_more: false,
    lastResponse: {
      headers: {},
      requestId: 'req_test',
      statusCode: 200,
      apiVersion: '2024-04-10',
    },
    data: [
      {
        id: `ii_${randomDataGenerator.string({ length: 14 })}`,
        object: 'line_item',
        amount: 1099,
        currency: 'usd',
        description: 'T-shirt',
        discountable: true,
        discounts: [],
        invoice: null,
        amount_excluding_tax: 100,
        discount_amounts: [],
        proration_details: null,
        type: 'invoiceitem',
        unit_amount_excluding_tax: null,
        livemode: false,
        metadata: {},
        period: {
          end: 1680640231,
          start: 1680640231,
        },
        plan: null,
        price: {
          id: `price_${randomDataGenerator.string({ length: 14 })}`,
          object: 'price',
          active: true,
          billing_scheme: 'per_unit',
          created: 1680640229,
          currency: 'usd',
          custom_unit_amount: null,
          livemode: false,
          lookup_key: null,
          metadata: {},
          nickname: null,
          product: `prod_${randomDataGenerator.string({ length: 12 })}`,
          recurring: null,
          tax_behavior: 'unspecified',
          tiers_mode: null,
          transform_quantity: null,
          type: 'one_time',
          unit_amount: 1099,
          unit_amount_decimal: '1099',
        },
        proration: false,
        quantity: 1,
        subscription: null,
        tax_rates: [],
        ...lineItemParams,
      },
    ],
    ...objParams,
  };
};

export const getUserSubscription = (params?: Partial<UserSubscription>): UserSubscription => {
  const baseSubscription: UserSubscription = {
    type: 'subscription',
    subscriptionId: `sub_${randomDataGenerator.string({ length: 14 })}`,
    amount: 9999,
    currency: 'usd',
    interval: 'month',
    nextPayment: randomDataGenerator.date().getDate(),
    priceId: `price_${randomDataGenerator.string({ length: 14 })}`,
    plan: {
      status: 'active',
      planId: `price_${randomDataGenerator.string({ length: 14 })}`,
      productId: `prod_${randomDataGenerator.string({ length: 14 })}`,
      currency: 'EUR',
      amountOfSeats: 1,
      isLifetime: false,
      isTeam: false,
      monthlyPrice: 10,
      name: 'Essential',
      paymentInterval: 'month',
      price: 10,
      renewalPeriod: RenewalPeriod.Monthly,
      simpleName: 'Essential',
      storageLimit: randomDataGenerator.natural({ length: 10 }),
      type: UserType.Individual,
    },
  };

  return {
    ...baseSubscription,
    ...params,
  };
};

export const voidPromise = () => Promise.resolve();
