import { InvalidConfirmationTokenError } from '../errors/PaymentErrors';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { ConfirmationToken } from '../infrastructure/domain/entities/confirmationToken';
import CacheService from './cache.service';

export class ConfirmationTokenService {
  constructor(private readonly cacheService: CacheService) {}

  /**
   * @throws {InvalidConfirmationTokenError} When the token is unknown, expired, too old or was already used.
   */
  async validateAndClaim(confirmationTokenId: ConfirmationToken['id']): Promise<void> {
    const confirmationToken = await stripePaymentsAdapter.getConfirmationToken(confirmationTokenId);

    if (!confirmationToken.canStartPaymentAttempt()) {
      throw new InvalidConfirmationTokenError();
    }

    const isFirstUse = await this.cacheService.markConfirmationTokenAsUsed(confirmationToken.id);

    if (!isFirstUse) {
      throw new InvalidConfirmationTokenError();
    }
  }
}
