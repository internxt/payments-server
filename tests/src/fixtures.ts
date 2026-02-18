import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';
import config from '../../src/config';
import { User, UserSubscription, UserType } from '../../src/core/users/User';
import { PaymentIntent, PaymentIntentCrypto, PaymentIntentFiat, PromotionCode } from '../../src/types/payment';
import { RenewalPeriod, SubscriptionCreated } from '../../src/types/subscription';
import { Coupon } from '../../src/core/coupons/Coupon';
import {
  CreateCryptoInvoicePayload,
  Currency,
  ParsedCreatedInvoiceResponse,
  ParsedInvoiceResponse,
  RawCreateInvoiceResponse,
  RawInvoiceResponse,
} from '../../src/types/bit2me';
import { Tier } from '../../src/core/users/Tier';
import { ObjectId } from 'mongodb';
import { LicenseCode } from '../../src/core/users/LicenseCode';
import { Bit2MePaymentStatusCallback } from '../../src/webhooks/providers/bit2me';
import { AllowedCryptoCurrencies } from '../../src/utils/currency';
import Stripe from 'stripe';
import {
  CUSTOMER_BASE,
  PRODUCT_BASE,
  PRICE_BASE,
  PROMOTION_CODE_BASE,
  TAX_CALCULATION_BASE,
  SUBSCRIPTION_BASE,
  PAYMENT_INTENT_BASE,
  INVOICE_BASE,
  CHARGE_BASE,
  DISPUTE_BASE,
  PAYMENT_METHOD_BASE,
  COUPON_BASE,
} from './fixtures/stripe-base.generated';
import { HealthStatus } from '../../src/services/health.service';

const randomDataGenerator = new Chance();

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export const getHealthCheck = (params?: Partial<HealthStatus>): HealthStatus => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cache: {
      status: 'ok',
    },
    database: {
      status: 'ok',
    },
    ...params,
  };
};

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

export const getValidGatewayToken = () => {
  return jwt.sign({}, Buffer.from(config.PAYMENTS_GATEWAY_SECRET, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: '15m',
    allowInsecureKeySizes: true,
  });
};

export const getValidUserToken = (payload: { customerId?: string; invoiceId?: string }): string => {
  return jwt.sign(payload, config.JWT_SECRET);
};

export const getCustomer = (params?: Partial<Stripe.Customer>): Stripe.Customer => {
  return {
    ...CUSTOMER_BASE,
    id: `cus_${randomDataGenerator.string({ length: 20 })}`,
    address: {
      postal_code: '123456',
      country: 'ES',
      city: 'Valencia',
      line1: 'Avenida el Port',
      line2: 'Angels',
      state: 'Valencia',
    },
    email: 'example@internxt.com',
    name: 'My internxt',
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
    ...PRODUCT_BASE,
    id: `prod_${randomDataGenerator.string({ length: 12 })}`,
    type: 'service',
    metadata: {
      type: userType ?? UserType.Individual,
    },
    name: 'Gold Plan',
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
    ...TAX_CALCULATION_BASE,
    ...params,
  };
};

export const getPromoCode = (params?: DeepPartial<Stripe.PromotionCode>): Stripe.PromotionCode => {
  return {
    ...PROMOTION_CODE_BASE,
    id: `promo_${randomDataGenerator.string({ length: 22 })}`,
    active: true,
    code: randomDataGenerator.string({ length: 10 }),
    coupon: {
      ...COUPON_BASE,
      id: randomDataGenerator.string({ length: 10 }),
      currency: null,
    },
    expires_at: null,
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
    ...PRICE_BASE,
    id: `price_${randomDataGenerator.string({ length: 12 })}`,
    currency: 'eur',
    product: 'prod_NZKdYqrwEYx6iK',
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
  const subscriptionId = `sub_${randomDataGenerator.string({ length: 14 })}`;
  const invoice = `in_${randomDataGenerator.string({ length: 14 })}`;
  const productId = `prod_${randomDataGenerator.string({ length: 12 })}`;
  const priceId = `price_${randomDataGenerator.string({ length: 12 })}`;

  return {
    ...SUBSCRIPTION_BASE,
    id: subscriptionId,
    customer,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    default_payment_method: {
      ...PAYMENT_METHOD_BASE,
      id: `pm_${randomDataGenerator.string({ length: 14 })}`,
      customer,
    } as Stripe.PaymentMethod,
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
          ...PROMOTION_CODE_BASE,
          id: `promo_${randomDataGenerator.string({ length: 22 })}`,
          active: true,
          code: 'PROMO_CODE',
          coupon: {
            ...COUPON_BASE,
            id: 'jMT0WJUD',
            currency: null,
          },
          expires_at: null,
        },
      },
    ],
    items: {
      object: 'list',
      data: [
        {
          id: `si_${randomDataGenerator.string({ length: 12 })}`,
          object: 'subscription_item',
          billing_thresholds: null,
          created: randomDataGenerator.natural({ length: 10 }),
          current_period_end: randomDataGenerator.natural({ length: 10 }),
          current_period_start: randomDataGenerator.natural({ length: 10 }),
          metadata: {},
          discounts: null as any,
          plan: {
            meter: null,
            id: priceId,
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
              ...PRODUCT_BASE,
              id: productId,
              type: 'service',
              metadata: {
                type: `${userType}`,
              },
            },
            tiers_mode: null,
            transform_usage: null,
            trial_period_days: null,
            usage_type: 'licensed',
          },
          price: {
            ...PRICE_BASE,
            id: priceId,
            metadata: {
              maxSpaceBytes: '100',
            },
            product: productId,
          },
          quantity: 1,
          subscription: subscriptionId,
          tax_rates: [],
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: `/v1/subscription_items?subscription=${subscriptionId}`,
    },
    latest_invoice: invoice,
    status: 'active',
    trial_end: null,
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
  const availableSeats = seats ?? undefined;
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
    ...PAYMENT_INTENT_BASE,
    id: `pi_${randomDataGenerator.string({ length: 14 })}`,
    invoice: `in_${randomDataGenerator.string({ length: 14 })}`,
    amount: 2000,
    client_secret: `pi_${randomDataGenerator.string({ length: 24 })}`,
    payment_method_types: ['card', 'link'],
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
      cli: { enabled: false },
      rclone: { enabled: false },
      drive: {
        enabled: false,
        foreignTierId: randomUUID(),
        maxSpaceBytes: randomDataGenerator.integer({ min: 1024 * 1024 * 1024, max: 5 * 1024 * 1024 * 1024 }),
        workspaces: {
          enabled: false,
          maximumSeats: randomDataGenerator.integer({ min: 10, max: 100 }),
          minimumSeats: 3,
          maxSpaceBytesPerSeat: randomDataGenerator.integer({ min: 1024 * 1024 * 1024, max: 5 * 1024 * 1024 * 1024 }),
        },
        passwordProtectedSharing: { enabled: false },
        restrictedItemsSharing: { enabled: false },
      },
      darkMonitor: {
        enabled: false,
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
  const payload: CreateCryptoInvoicePayload = {
    foreignId: 'invoice-123',
    priceAmount: 100,
    priceCurrency: AllowedCryptoCurrencies['Bitcoin'],
    title: 'Test Invoice',
    description: 'Payment for product',
    successUrl: 'https://success.url',
    cancelUrl: 'https://cancel.url',
    purchaserEmail: 'test@internxt.com',
    securityToken: 'secure-token',
    shopper: {
      type: 'personal',
      email: 'test@internxt.com',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      ipAddress: '127.0.0.1',
      addressLine: '123 Main St',
      city: 'New York',
      countryOfResidence: 'US',
      postalCode: '10001',
    },
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
  const generatedProductId = productId ?? `prod_${randomDataGenerator.string({ length: 12 })}`;

  return {
    ...INVOICE_BASE,
    id: `in_${randomDataGenerator.string({ length: 14, alpha: true, numeric: true, symbols: false })}`,
    customer: `cus_${randomDataGenerator.string({ length: 20 })}`,
    customer_email: 'example@internxt.com',
    customer_name: 'My internxt',
    lines: {
      ...INVOICE_BASE.lines,
      data: [
        {
          ...INVOICE_BASE.lines.data[0],
          id: `il_${randomDataGenerator.string({ length: 24 })}`,
          price: {
            ...PRICE_BASE,
            id: `price_${randomDataGenerator.string({ length: 12 })}`,
            metadata: {
              maxSpaceBytes: `${randomDataGenerator.natural({ length: 8 })}`,
              type: userType as string,
            },
            product: {
              ...PRODUCT_BASE,
              id: generatedProductId,
              type: 'service',
              metadata: {
                type: userType,
              },
              name: 'Ultimate Plan',
            },
          },
        },
      ],
    },
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
    ...CHARGE_BASE,
    id: `ch_${randomDataGenerator.string({ length: 10 })}`,
    amount: 1099,
    amount_captured: 1099,
    balance_transaction: `txn_${randomDataGenerator.string({ length: 10 })}`,
    captured: true,
    customer: `cus_${randomDataGenerator.string({ length: 20 })}`,
    invoice: `in_${randomDataGenerator.string({ length: 16 })}`,
    payment_method: `card_${randomDataGenerator.string({ length: 10 })}`,
    receipt_email: 'example@inxt.com',
    ...params,
  };
}

export function getDispute(params?: Partial<Stripe.Dispute>): Stripe.Dispute {
  return {
    ...DISPUTE_BASE,
    id: `dp_${randomDataGenerator.string({ length: 24 })}`,
    charge: `ch_${randomDataGenerator.string({ length: 16 })}`,
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
    ...PAYMENT_METHOD_BASE,
    id: `pm_${randomDataGenerator.string({ length: 24 })}`,
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
