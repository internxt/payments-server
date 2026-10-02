import { InvalidConfirmationTokenError } from '../errors/PaymentErrors';
import { ConfirmationToken } from '../infrastructure/domain/entities/confirmationToken';
import { PaymentsAdapter } from '../infrastructure/domain/ports/payments.adapter';
import CacheService from './cache.service';

export class ConfirmationTokenService {
  constructor(
    private readonly paymentsAdapter: PaymentsAdapter,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * @throws {InvalidConfirmationTokenError} When the token is unknown, expired, too old or was already used.
   */
  async validateAndClaim(confirmationTokenId: ConfirmationToken['id']): Promise<void> {
    const confirmationToken = await this.paymentsAdapter.getConfirmationToken(confirmationTokenId);

    if (!confirmationToken.canStartPaymentAttempt()) {
      throw new InvalidConfirmationTokenError();
    }

    const isFirstUse = await this.cacheService.markConfirmationTokenAsUsed(confirmationToken.id);

    if (!isFirstUse) {
      throw new InvalidConfirmationTokenError();
    }
  }
}
