import dayjs from 'dayjs';

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
  remainingPayments: number;
  cancelAt: number;
  cancellationDate: string;
  isFirstMonth: boolean;
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
  commitmentCancellationInfo: CommitmentCancellationInfo;

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
    this.commitmentCancellationInfo = this.getAnnualCommitmentCancellationInfo(this);
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

  /**
   * Gets the annual commitment cancellation info
   * @param subscription - The subscription we want to get info for
   * @returns - The annual commitment cancellation info (remaining payments, amount per month, currency, cancel at)
   */
  private getAnnualCommitmentCancellationInfo(subscription: Subscription): {
    remainingPayments: number;
    cancelAt: number;
    cancellationDate: string;
    isFirstMonth: boolean;
  } {
    const createdAt = dayjs.unix(subscription.created);
    const now = dayjs();

    const monthsElapsed = now.diff(createdAt, 'month');
    const monthsIntoPeriod = monthsElapsed % 12;
    const periodsElapsed = Math.floor(monthsElapsed / 12);

    const cancelAtDate = createdAt.add(periodsElapsed + 1, 'year');
    const cancelAt = cancelAtDate.unix();

    const isFirstMonth = monthsElapsed === 0 && now.diff(createdAt, 'day') <= 30;
    const remainingPayments = monthsIntoPeriod === 0 ? 12 : 12 - monthsIntoPeriod;
    const cancellationDate = cancelAtDate.toISOString();

    return { remainingPayments, cancelAt, cancellationDate, isFirstMonth };
  }
}
