import { BadRequestError } from '../../../src/errors/Errors';
import {
  ALL_CURRENCIES,
  AllowedFiatCurrencies,
  getAllowedCurrencies,
  isFiatCurrency,
  isValidCurrency,
  normalizeForStripe,
} from '../../../src/utils/currency';

describe('Currency Adapter Service', () => {
  describe('Get allowed currencies', () => {
    test('When called, then it returns the list of allowed currencies', () => {
      const allowedFiatCurrencies = Object.values(AllowedFiatCurrencies);

      const result = getAllowedCurrencies();

      expect(result).toStrictEqual(allowedFiatCurrencies);
    });
  });

  describe('Normalize currency for Stripe', () => {
    test('When a valid fiat currency is provided, then it returns lowercase format', () => {
      const result = normalizeForStripe('EUR');

      expect(result).toBe('eur');
    });

    test('When a valid fiat currency in mixed case is provided, then it returns lowercase format', () => {
      const result = normalizeForStripe('UsD');

      expect(result).toBe('usd');
    });

    test('When a cryptocurrency is provided, then it throws an error because it is no longer supported', () => {
      expect(() => normalizeForStripe('BTC')).toThrow(BadRequestError);
    });

    test('When an unsupported currency is provided, then it throws an error', () => {
      expect(() => normalizeForStripe('INVALID')).toThrow(BadRequestError);
    });

    test('When currency has whitespace, then it normalizes correctly', () => {
      const currency = 'INVALID';
      const badRequestError = new BadRequestError(
        `Currency ${currency} is not supported. Allowed currencies: ${ALL_CURRENCIES.join(', ')}`,
      );

      expect(() => normalizeForStripe('  EUR  ')).not.toThrow();
      expect(() => normalizeForStripe(currency)).toThrow(badRequestError);
    });
  });

  describe('Check if the currency is fiat', () => {
    const validFiats = Object.values(AllowedFiatCurrencies);

    test.each(validFiats)('When %s fiat currency is provided, then it returns true', (fiat) => {
      expect(isFiatCurrency(fiat)).toBe(true);
    });

    test('When an invalid currency is provided, then it returns false', () => {
      const result = isFiatCurrency('INVALID');
      expect(result).toBe(false);
    });
  });

  describe('Check if the currency is valid', () => {
    const allValidCurrencies = Object.values(AllowedFiatCurrencies);

    test.each(allValidCurrencies)('When valid currency %s is provided, then it returns true', (currency) => {
      expect(isValidCurrency(currency)).toBe(true);
    });

    test.each(allValidCurrencies)(
      'When valid currency %s in lowercase is provided, then it returns true',
      (currency) => {
        expect(isValidCurrency(currency.toLowerCase())).toBe(true);
      },
    );

    const invalidCurrencies = ['INVALID', 'XYZ', '123', '', 'BTC'];

    test.each(invalidCurrencies)('When invalid currency "%s" is provided, then it returns false', (currency) => {
      expect(isValidCurrency(currency)).toBe(false);
    });
  });
});
