export type SubscriptionStatus =
  'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export interface SubscriptionAttributes {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  metadata: Record<string, unknown>;
  created: number;
  priceId: string;
  currentPeriodEnd: number;
  paymentMethod?: string;
  trialEnd?: number;
}

export interface CommitmentCancellationInfo {
  remainingMonths: number;
  cancelAt: number;
  cancellationDate: string;
  isElegibleForCancellation: boolean;
}

export class Subscription implements SubscriptionAttributes {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  metadata: Record<string, unknown>;
  created: number;
  priceId: string;
  currentPeriodEnd: number;
  paymentMethod?: string;
  trialEnd?: number;

  constructor({
    id,
    customer,
    metadata,
    status,
    created,
    priceId,
    currentPeriodEnd,
    paymentMethod,
    trialEnd,
  }: SubscriptionAttributes) {
    this.id = id;
    this.customer = customer;
    this.status = status;
    this.metadata = metadata;
    this.created = created;
    this.priceId = priceId;
    this.currentPeriodEnd = currentPeriodEnd;
    this.trialEnd = trialEnd;
    this.paymentMethod = paymentMethod;
  }

  static toDomain(attributes: SubscriptionAttributes): Subscription {
    return new Subscription(attributes);
  }

  get isActive(): boolean {
    return this.status === 'active';
  }

  get isTrialing(): boolean {
    return this.status === 'trialing';
  }
}
