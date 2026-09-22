import { BadRequestError } from '../../../src/errors/Errors';
import { getPaymentMethodTypes } from '../../../src/utils/paymentMethods';

describe('Payment method types', () => {
  describe('Methods allowed per currency and interval', () => {
    test('When the currency is EUR, then PayPal is allowed alongside card', () => {
      const result = getPaymentMethodTypes('eur', 'month');

      expect(result).toStrictEqual(['card', 'paypal']);
    });

    test('When the currency is INR, then UPI is allowed alongside card', () => {
      const result = getPaymentMethodTypes('inr', 'month');

      expect(result).toStrictEqual(['card', 'upi']);
    });

    test('When the currency is BRL, then PIX is allowed alongside card', () => {
      const result = getPaymentMethodTypes('brl', 'month');

      expect(result).toStrictEqual(['card', 'pix']);
    });

    test.each([
      ['eur', ['card', 'paypal']],
      ['usd', ['card', 'paypal']],
      ['inr', ['card', 'upi']],
      ['brl', ['card', 'pix']],
    ])(
      'When the currency is %s and the interval is yearly, then its alternative method is allowed alongside card',
      (currency, expected) => {
        const result = getPaymentMethodTypes(currency as string, 'year');

        expect(result).toStrictEqual(expected);
      },
    );

    test('When the interval is yearly, then the amount caps do not apply', () => {
      const result = getPaymentMethodTypes('inr', 'year', 150000);

      expect(result).toStrictEqual(['card', 'upi']);
    });

    test('When the currency is a crypto one, then it falls back to the EUR methods', () => {
      const result = getPaymentMethodTypes('BTC', 'lifetime');

      expect(result).toStrictEqual(['card', 'paypal', 'klarna']);
    });

    test('When the currency is not supported, then it throws', () => {
      expect(() => getPaymentMethodTypes('gbp', 'month')).toThrow(BadRequestError);
    });
  });

  describe('Methods capped by the charged amount', () => {
    test('When an INR lifetime amount exceeds the UPI cap, then UPI is dropped', () => {
      const result = getPaymentMethodTypes('inr', 'lifetime', 150000);

      expect(result).toStrictEqual(['card']);
    });

    test('When an INR lifetime amount is below the UPI cap, then UPI is kept', () => {
      const result = getPaymentMethodTypes('inr', 'lifetime', 50000);

      expect(result).toStrictEqual(['card', 'upi']);
    });

    test('When an INR lifetime amount is exactly the UPI cap, then UPI is dropped', () => {
      const result = getPaymentMethodTypes('inr', 'lifetime', 99000);

      expect(result).toStrictEqual(['card']);
    });

    test('When no amount is provided, then no amount based filtering is applied', () => {
      const result = getPaymentMethodTypes('inr', 'lifetime');

      expect(result).toStrictEqual(['card', 'upi']);
    });

    test('When the amount is large but the currency has no caps, then every method is kept', () => {
      const result = getPaymentMethodTypes('eur', 'lifetime', 150000);

      expect(result).toStrictEqual(['card', 'paypal', 'klarna']);
    });

    test('When a BRL lifetime amount exceeds the PIX cap, then PIX is dropped', () => {
      const result = getPaymentMethodTypes('brl', 'lifetime', 20000);

      expect(result).toStrictEqual(['card']);
    });

    test('When a BRL lifetime amount is below the PIX cap, then PIX is kept', () => {
      const result = getPaymentMethodTypes('brl', 'lifetime', 5000);

      expect(result).toStrictEqual(['card', 'pix']);
    });

    test('When a BRL lifetime amount is exactly the PIX cap, then PIX is dropped', () => {
      const result = getPaymentMethodTypes('brl', 'lifetime', 14600);

      expect(result).toStrictEqual(['card']);
    });

    test('When no amount is provided for BRL, then no amount based filtering is applied', () => {
      const result = getPaymentMethodTypes('brl', 'lifetime');

      expect(result).toStrictEqual(['card', 'pix']);
    });
  });
});
