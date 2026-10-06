import { getConfirmationToken } from '../../../fixtures';
import { ConfirmationToken } from '../../../../../src/infrastructure/domain/entities/confirmationToken';
import { CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES } from '../../../../../src/constants';

const nowInSeconds = () => Math.floor(Date.now() / 1000);

describe('Confirmation token entity', () => {
  test('When converting a Stripe token that has no payment attempt, then it is not marked as used', () => {
    const stripeToken = getConfirmationToken();

    const confirmationToken = ConfirmationToken.toDomain(stripeToken);

    expect(confirmationToken).toMatchObject({
      id: stripeToken.id,
      createdAt: new Date(stripeToken.created * 1000),
      expiresAt: new Date((stripeToken.expires_at as number) * 1000),
      isAlreadyUsed: false,
    });
  });

  test.each([
    ['payment', { payment_intent: 'pi_123' }],
    ['setup', { setup_intent: 'seti_123' }],
  ])('When the Stripe token is attached to a %s, then it is marked as used', (_, params) => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken(params));

    expect(confirmationToken.isAlreadyUsed).toBe(true);
  });

  test('When the Stripe token has no expiration, then the domain token has none either', () => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken({ expires_at: null }));

    expect(confirmationToken.expiresAt).toBeUndefined();
  });

  test('When the token is recent, unused and not expired, then a payment attempt can start', () => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken());

    expect(confirmationToken.canStartPaymentAttempt()).toBe(true);
  });

  test('When the token was already used, then a payment attempt cannot start', () => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken({ payment_intent: 'pi_123' }));

    expect(confirmationToken.canStartPaymentAttempt()).toBe(false);
  });

  test('When the token has expired, then a payment attempt cannot start', () => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken({ expires_at: nowInSeconds() - 1 }));

    expect(confirmationToken.canStartPaymentAttempt()).toBe(false);
  });

  test('When the token was created longer ago than the maximum age, then a payment attempt cannot start', () => {
    const confirmationToken = ConfirmationToken.toDomain(
      getConfirmationToken({ created: nowInSeconds() - (CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES + 1) * 60 }),
    );

    expect(confirmationToken.canStartPaymentAttempt()).toBe(false);
  });

  test('When the token was created just within the maximum age, then a payment attempt can start', () => {
    const confirmationToken = ConfirmationToken.toDomain(
      getConfirmationToken({ created: nowInSeconds() - (CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES - 1) * 60 }),
    );

    expect(confirmationToken.canStartPaymentAttempt()).toBe(true);
  });
});
