export interface SubscriptionAttributes {
  id: string;
  customer: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created: number;
  priceId: string;
  currentPeriodEnd: number;
  trialing?: boolean;
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
  active: boolean;
  metadata: Record<string, unknown>;
  created: number;
  priceId: string;
  currentPeriodEnd: number;
  trialing?: boolean;
  trialEnd?: number;

  constructor({
    id,
    customer,
    active,
    metadata,
    created,
    priceId,
    currentPeriodEnd,
    trialing,
    trialEnd,
  }: SubscriptionAttributes) {
    this.id = id;
    this.customer = customer;
    this.active = active;
    this.metadata = metadata;
    this.created = created;
    this.priceId = priceId;
    this.currentPeriodEnd = currentPeriodEnd;
    this.trialing = trialing;
    this.trialEnd = trialEnd;
  }

  static toDomain(attributes: SubscriptionAttributes): Subscription {
    return new Subscription(attributes);
  }

  get isActive(): boolean {
    return this.active;
  }

  get isTrialing(): boolean {
    return this.trialing ?? false;
  }
}
