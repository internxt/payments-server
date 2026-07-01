import { Chance } from 'chance';
import { Invoice, InvoiceAttributes } from '../../src/infrastructure/domain/entities/invoice';
import { PaymentIntent } from '../../src/infrastructure/domain/entities/paymentIntent';

const randomDataGenerator = new Chance();

export const getInvoiceEntity = (params?: Partial<InvoiceAttributes>): Invoice => {
  const priceId = `price_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`;
  const lineItemId = `il_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`;
  const invoiceId = `in_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`;
  const amount = randomDataGenerator.integer({ min: 100, max: 100000 });

  return Invoice.toDomain({
    id: invoiceId,
    paid: true,
    paidOutOfBand: false,
    subscription: `sub_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`,
    status: 'paid',
    created: Math.floor(Date.now() / 1000),
    total: amount,
    metadata: {},
    charge: `ch_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`,
    pdf: `https://pay.stripe.com/invoice/acct_123/${invoiceId}/pdf`,
    currency: 'eur',
    lines: [
      {
        id: lineItemId,
        object: 'line_item',
        amount,
        amount_excluding_tax: amount,
        currency: 'eur',
        description: 'Internxt Drive 2TB - 1 year',
        discount_amounts: [],
        discountable: true,
        discounts: [],
        invoice: invoiceId,
        livemode: false,
        metadata: {
          maxSpaceBytes: '2199023255552',
          type: 'individual',
        },
        period: {
          end: Math.floor(Date.now() / 1000) + 31536000,
          start: Math.floor(Date.now() / 1000),
        },
        plan: null,
        pretax_credit_amounts: [],
        price: {
          id: priceId,
          object: 'price',
          active: true,
          billing_scheme: 'per_unit',
          created: Math.floor(Date.now() / 1000),
          currency: 'eur',
          custom_unit_amount: null,
          livemode: false,
          lookup_key: null,
          metadata: {
            maxSpaceBytes: '2199023255552',
            type: 'individual',
          },
          nickname: null,
          product: `prod_${randomDataGenerator.string({ length: 14, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`,
          recurring: {
            aggregate_usage: null,
            interval: 'year',
            interval_count: 1,
            meter: null,
            trial_period_days: null,
            usage_type: 'licensed',
          },
          tax_behavior: 'unspecified',
          tiers_mode: null,
          transform_quantity: null,
          type: 'recurring',
          unit_amount: amount,
          unit_amount_decimal: String(amount),
          currency_options: undefined,
        },
        proration: false,
        proration_details: null,
        quantity: 1,
        subscription: null,
        tax_amounts: [],
        tax_rates: [],
        type: 'subscription',
        unit_amount_excluding_tax: String(amount),
        parent: null,
        pricing: {
          unit_amount_decimal: String(amount),
          type: 'price_details',
        },
        taxes: [],
      },
    ],
    ...params,
  });
};

export const getPaymentIntentEntity = (params?: Partial<PaymentIntent>): PaymentIntent => {
  return PaymentIntent.toDomain({
    id: `pi_${randomDataGenerator.string({ length: 14 })}`,
    customer: `cus_${randomDataGenerator.string({ length: 14 })}`,
    status: 'requires_payment_method',
    clientSecret: `pi_${randomDataGenerator.string({ length: 24 })}`,
    ...params,
  });
};
