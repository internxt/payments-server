import Stripe from 'stripe';
import { CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES } from '../../../constants';

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;

interface ConfirmationTokenAttributes {
  id: string;
  createdAt: Date;
  expiresAt?: Date;
  isAlreadyUsed: boolean;
}

export class ConfirmationToken implements ConfirmationTokenAttributes {
  id: string;
  createdAt: Date;
  expiresAt?: Date;
  isAlreadyUsed: boolean;

  constructor({ id, createdAt, expiresAt, isAlreadyUsed }: ConfirmationTokenAttributes) {
    this.id = id;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
    this.isAlreadyUsed = isAlreadyUsed;
  }

  static toDomain(stripeConfirmationToken: Stripe.ConfirmationToken): ConfirmationToken {
    return new ConfirmationToken({
      id: stripeConfirmationToken.id,
      createdAt: new Date(stripeConfirmationToken.created * MILLISECONDS_PER_SECOND),
      expiresAt: stripeConfirmationToken.expires_at
        ? new Date(stripeConfirmationToken.expires_at * MILLISECONDS_PER_SECOND)
        : undefined,
      isAlreadyUsed: !!stripeConfirmationToken.payment_intent || !!stripeConfirmationToken.setup_intent,
    });
  }

  canStartPaymentAttempt(now: Date = new Date()): boolean {
    const isExpired = !!this.expiresAt && this.expiresAt.getTime() <= now.getTime();
    const oldestAllowedCreationTime = now.getTime() - CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES * MILLISECONDS_PER_MINUTE;
    const isRecent = this.createdAt.getTime() >= oldestAllowedCreationTime;

    return !this.isAlreadyUsed && !isExpired && isRecent;
  }
}
