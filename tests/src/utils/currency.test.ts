import { BadRequestError } from '../../../src/errors/Errors';
import {
  AllowedCryptoCurrencies,
  AllowedFiatCurrencies,
  isCryptoCurrency,
  isFiatCurrency,
  isValidCurrency,
  normalizeForBit2Me,
  normalizeForStripe,
} from '../../../src/utils/currency';

describe('Currency Adapter Service', () => {
  describe('Normalize currency for Stripe', () => {
    test('When a valid fiat currency is provided, then it returns lowercase format', () => {
      const result = normalizeForStripe('EUR');

      expect(result).toBe('eur');
    });

    test('When a valid fiat currency in mixed case is provided, then it returns lowercase format', () => {
      const result = normalizeForStripe('UsD');

      expect(result).toBe('usd');
    });

    test('When a valid cryptocurrency is provided, then it returns fallback fiat currency that is eur in lowercase format', () => {
      const result = normalizeForStripe('BTC');

      expect(result).toBe('eur');
    });

    test('When an unsupported currency is provided, then it throws an error', () => {
      expect(() => normalizeForStripe('INVALID')).toThrow(BadRequestError);
    });

    test('When currency has whitespace, then it normalizes correctly', () => {
      const result = normalizeForStripe('  EUR  ');

      expect(result).toBe('eur');
    });
  });

  describe('Normalize currency for Bit2Me', () => {
    test('When a fiat currency is provided, then an error indicating that Bit2Me does not support these currencies is thrown', () => {
      expect(() => normalizeForBit2Me('EUR')).toThrow(BadRequestError);
    });

    test('When a valid cryptocurrency is provided, then it returns uppercase format', () => {
      const result = normalizeForBit2Me('btc');

      expect(result).toBe('BTC');
    });

    test('When an unsupported currency is provided, then it throws an error', () => {
      expect(() => normalizeForBit2Me('INVALID')).toThrow('Currency INVALID is not supported by Bit2Me');
    });

    test('When currency has whitespace, then it normalizes correctly', () => {
      const result = normalizeForBit2Me('  btc  ');

      expect(result).toBe('BTC');
    });
  });

  describe('Check if the currency is crypto', () => {
    const validCryptos = Object.values(AllowedCryptoCurrencies);

    test.each(validCryptos)('When %s cryptocurrency is provided, then it returns true', (crypto) => {
      expect(isCryptoCurrency(crypto)).toBe(true);
    });

    test.each(validCryptos)('When %s cryptocurrency in lowercase is provided, then it returns true', (crypto) => {
      expect(isCryptoCurrency(crypto.toLowerCase())).toBe(true);
    });

    test('When an invalid currency is provided, then it returns false', () => {
      const result = isCryptoCurrency('INVALID');
      expect(result).toBe(false);
    });
  });

  describe('Check if the currency is fiat', () => {
    const validFiats = Object.values(AllowedFiatCurrencies);

    test.each(validFiats)('When %s fiat currency is provided, then it returns false', (fiat) => {
      expect(isCryptoCurrency(fiat)).toBe(false);
    });

    test('When an invalid currency is provided, then it returns false', () => {
      const result = isFiatCurrency('INVALID');
      expect(result).toBe(false);
    });
  });

  describe('Check if the currency is valid', () => {
    const allValidCurrencies = [...Object.values(AllowedCryptoCurrencies), ...Object.values(AllowedFiatCurrencies)];

    test.each(allValidCurrencies)('When valid currency %s is provided, then it returns true', (currency) => {
      expect(isValidCurrency(currency)).toBe(true);
    });

    test.each(allValidCurrencies)(
      'When valid currency %s in lowercase is provided, then it returns true',
      (currency) => {
        expect(isValidCurrency(currency.toLowerCase())).toBe(true);
      },
    );

    const invalidCurrencies = ['INVALID', 'XYZ', '123', ''];

    test.each(invalidCurrencies)('When invalid currency "%s" is provided, then it returns false', (currency) => {
      expect(isValidCurrency(currency)).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('When empty string is provided, then appropriate error is thrown', () => {
      expect(() => normalizeForStripe('')).toThrow();
      expect(() => normalizeForBit2Me('')).toThrow();
    });

    test('When currency with special characters is provided, then it handles gracefully', () => {
      expect(() => normalizeForStripe('BTC!')).toThrow();
      expect(() => normalizeForBit2Me('EUR@')).toThrow();
    });
  });
});
