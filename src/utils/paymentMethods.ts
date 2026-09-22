import { PriceInterval } from '../infrastructure/domain/entities/price';
import { normalizeForStripe } from './currency';


const PAYMENT_METHODS: Record<string, Record<PriceInterval, string[]>> = {
  eur: {
    month: ['card', 'paypal'],
    year: ['card', 'paypal'],
    lifetime: ['card', 'paypal', 'klarna'],
  },
  usd: {
    month: ['card', 'paypal'],
    year: ['card', 'paypal'],
    lifetime: ['card', 'paypal'],
  },
  inr: {
    month: ['card', 'upi'],
    year: ['card', 'upi'],
    lifetime: ['card', 'upi'],
  },
  brl: {
    month: ['card', 'pix'],
    year: ['card', 'pix'],
    lifetime: ['card', 'pix'],
  },
};

const DEFAULT_PAYMENT_METHODS = ['card'];

const UPI_MAX_DECIMAL_AMOUNT = 99000;

const PIX_MAX_DECIMAL_AMOUNT = 14600;

const PAYMENT_METHOD_LIMITS: Record<string, Partial<Record<PriceInterval, Record<string, number>>>> = {
  inr: {
    lifetime: { upi: UPI_MAX_DECIMAL_AMOUNT },
  },
  brl: {
    lifetime: { pix: PIX_MAX_DECIMAL_AMOUNT },
  },
};


export function getPaymentMethodTypes(
  currency: string,
  interval: PriceInterval,
  decimalAmountWithTax?: number,
): string[] {
  const normalizedCurrency = normalizeForStripe(currency);

  const methods = PAYMENT_METHODS[normalizedCurrency]?.[interval] ?? DEFAULT_PAYMENT_METHODS;
  const limits = PAYMENT_METHOD_LIMITS[normalizedCurrency]?.[interval];

  if (!limits || decimalAmountWithTax === undefined) return methods;

  const allowed = methods.filter((method) => {
    const max = limits[method];
    return max === undefined || decimalAmountWithTax < max;
  });

  return allowed.length > 0 ? allowed : DEFAULT_PAYMENT_METHODS;
}
