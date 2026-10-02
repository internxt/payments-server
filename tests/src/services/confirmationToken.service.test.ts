import config from '../../../src/config';
import { InvalidConfirmationTokenError } from '../../../src/errors/PaymentErrors';
import { ConfirmationToken } from '../../../src/infrastructure/domain/entities/confirmationToken';
import { PaymentsAdapter } from '../../../src/infrastructure/domain/ports/payments.adapter';
import CacheService from '../../../src/services/cache.service';
import { ConfirmationTokenService } from '../../../src/services/confirmationToken.service';
import { CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES } from '../../../src/constants';
import { getConfirmationToken } from '../fixtures';

jest.mock('ioredis', () => require('ioredis-mock'));

const nowInSeconds = () => Math.floor(Date.now() / 1000);

describe('Confirmation token service', () => {
  let getConfirmationTokenFromPayments: jest.Mock;
  let confirmationTokenService: ConfirmationTokenService;

  const paymentsKnowsToken = (params?: Parameters<typeof getConfirmationToken>[0]) => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken(params));
    getConfirmationTokenFromPayments.mockResolvedValue(confirmationToken);
    return confirmationToken;
  };

  beforeEach(() => {
    getConfirmationTokenFromPayments = jest.fn();
    const paymentsAdapter = { getConfirmationToken: getConfirmationTokenFromPayments } as unknown as PaymentsAdapter;
    confirmationTokenService = new ConfirmationTokenService(paymentsAdapter, new CacheService(config));
  });

  test('When the token is valid and unused, then it is accepted', async () => {
    const confirmationToken = paymentsKnowsToken();

    await expect(confirmationTokenService.validateAndClaim(confirmationToken.id)).resolves.toBeUndefined();
  });

  test('When the same token is used twice, then the second use is rejected', async () => {
    const confirmationToken = paymentsKnowsToken();
    await confirmationTokenService.validateAndClaim(confirmationToken.id);

    await expect(confirmationTokenService.validateAndClaim(confirmationToken.id)).rejects.toThrow(
      InvalidConfirmationTokenError,
    );
  });

  test.each([
    ['has expired', () => ({ expires_at: nowInSeconds() - 1 })],
    ['was already used for a payment', () => ({ payment_intent: 'pi_already_used' })],
    ['was already used for a setup', () => ({ setup_intent: 'seti_already_used' })],
    ['is not recent', () => ({ created: nowInSeconds() - (CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES + 1) * 60 })],
  ])('When the token %s, then it is rejected', async (_, params) => {
    const confirmationToken = paymentsKnowsToken(params());

    await expect(confirmationTokenService.validateAndClaim(confirmationToken.id)).rejects.toThrow(
      InvalidConfirmationTokenError,
    );
  });

  test('When a token is rejected, then it is not consumed and a later valid use is not affected', async () => {
    const confirmationToken = paymentsKnowsToken({ expires_at: nowInSeconds() - 1 });
    await expect(confirmationTokenService.validateAndClaim(confirmationToken.id)).rejects.toThrow();

    getConfirmationTokenFromPayments.mockResolvedValue(
      new ConfirmationToken({ ...confirmationToken, expiresAt: undefined }),
    );

    await expect(confirmationTokenService.validateAndClaim(confirmationToken.id)).resolves.toBeUndefined();
  });

  test('When the payment provider does not know the token, then it is rejected', async () => {
    getConfirmationTokenFromPayments.mockRejectedValue(new InvalidConfirmationTokenError());

    await expect(confirmationTokenService.validateAndClaim('ctoken_unknown')).rejects.toThrow(
      InvalidConfirmationTokenError,
    );
  });
});
