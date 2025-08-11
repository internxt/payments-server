import { BadRequestError } from '../errors/Errors';

export enum AllowedCryptoCurrencies {
  Bitcoin = 'BTC',
  Ethereum = 'ETH',
  Litecoin = 'LTC',
  BitcoinCash = 'BCH',
  Ripple = 'XRP',
  Tether = 'USDT',
  USDC = 'USDC',
  Tron = 'TRX',
  Cardano = 'ADA',
  BinanceCoin = 'BNB',
}

export enum AllowedFiatCurrencies {
  Euro = 'EUR',
  USDollar = 'USD',
}

const CRYPTO_CURRENCIES = new Set(Object.values(AllowedCryptoCurrencies));
const FIAT_CURRENCIES = new Set(Object.values(AllowedFiatCurrencies));
const ALL_CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES];

export function normalizeForStripe(currency: string): string {
  if (isCryptoCurrency(currency)) {
    return 'eur';
  }

  if (isFiatCurrency(currency)) {
    return currency.toLowerCase().trim();
  }

  throw new BadRequestError(`Currency ${currency} is not supported. Allowed currencies: ${ALL_CURRENCIES.join(', ')}`);
}

export function normalizeForBit2Me(currency: string): string {
  const upperCurrency = currency.toUpperCase().trim();

  if (isCryptoCurrency(currency)) {
    return upperCurrency;
  }

  throw new BadRequestError(
    `Currency ${currency} is not supported by Bit2Me. Allowed currencies: ${ALL_CURRENCIES.join(', ')}`,
  );
}

export function isCryptoCurrency(currency: string): boolean {
  return CRYPTO_CURRENCIES.has(currency.toUpperCase().trim() as AllowedCryptoCurrencies);
}

export function isFiatCurrency(currency: string): boolean {
  return FIAT_CURRENCIES.has(currency.toUpperCase().trim() as AllowedFiatCurrencies);
}

export function isValidCurrency(currency: string): boolean {
  const upperCurrency = currency.toUpperCase().trim() as AllowedFiatCurrencies | AllowedCryptoCurrencies;
  return ALL_CURRENCIES.includes(upperCurrency);
}
