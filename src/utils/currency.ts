import { BadRequestError } from '../errors/Errors';

export enum AllowedFiatCurrencies {
  Euro = 'EUR',
  USDollar = 'USD',
  IndianRupee = 'INR',
  BrazilianReal = 'BRL',
}

const FIAT_CURRENCIES = new Set(Object.values(AllowedFiatCurrencies));
export const ALL_CURRENCIES = [...FIAT_CURRENCIES];

export function getAllowedCurrencies(): string[] {
  return ALL_CURRENCIES;
}

export function normalizeForStripe(currency: string): string {
  if (isFiatCurrency(currency)) {
    return currency.toLowerCase();
  }

  throw new BadRequestError(`Currency ${currency} is not supported. Allowed currencies: ${ALL_CURRENCIES.join(', ')}`);
}

export function isFiatCurrency(currency: string): boolean {
  return FIAT_CURRENCIES.has(currency.toUpperCase().trim() as AllowedFiatCurrencies);
}

export function isValidCurrency(currency: string): boolean {
  const upperCurrency = currency.toUpperCase().trim() as AllowedFiatCurrencies;
  return ALL_CURRENCIES.includes(upperCurrency);
}
