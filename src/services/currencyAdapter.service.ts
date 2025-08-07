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

export class CurrencyAdapter {
  private static readonly cryptoCurrencies = new Set(Object.values(AllowedCryptoCurrencies));
  private static readonly fiatCurrencies = new Set(Object.values(AllowedFiatCurrencies));

  static normalizeForStripe(currency: string): string {
    const upperCurrency = currency.toUpperCase().trim();

    if (this.cryptoCurrencies.has(upperCurrency as AllowedCryptoCurrencies)) {
      return 'eur';
    }

    if (this.fiatCurrencies.has(upperCurrency as AllowedFiatCurrencies)) {
      return currency.toLowerCase().trim();
    }

    throw new BadRequestError(
      `Currency ${currency} is not supported. Allowed currencies: ${[...this.fiatCurrencies, ...this.cryptoCurrencies].join(', ')}`,
    );
  }

  static normalizeForBit2Me(currency: string): string {
    const upperCurrency = currency.toUpperCase().trim();

    if (this.cryptoCurrencies.has(upperCurrency as AllowedCryptoCurrencies)) {
      return upperCurrency;
    }

    throw new BadRequestError(
      `Currency ${currency} is not supported by Bit2Me. Allowed currencies: ${[...this.fiatCurrencies, ...this.cryptoCurrencies].join(', ')}`,
    );
  }

  static isCryptoCurrency(currency: string): boolean {
    return this.cryptoCurrencies.has(currency.toUpperCase().trim() as AllowedCryptoCurrencies);
  }

  static isFiatCurrency(currency: string): boolean {
    return this.fiatCurrencies.has(currency.toUpperCase().trim() as AllowedFiatCurrencies);
  }

  static isValidCurrency(currency: string): boolean {
    const upperCurrency = currency.toUpperCase().trim();
    return (
      this.cryptoCurrencies.has(upperCurrency as AllowedCryptoCurrencies) ||
      this.fiatCurrencies.has(upperCurrency as AllowedFiatCurrencies)
    );
  }
}
