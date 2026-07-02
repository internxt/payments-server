import { UserType } from '../../../core/users/User';

export type PriceInterval = 'year' | 'month' | 'lifetime';

export interface PriceAttributes {
  id: string;
  productId: string;
  bytes: number;
  interval: PriceInterval;
  commitmentPlan: boolean;
  recurring: boolean;
  amount: number;
  currency: string;
  decimalAmount: number;
  type: UserType;
  intervalCount?: number;
  minimumSeats?: number;
  maximumSeats?: number;
}

export class Price implements PriceAttributes {
  id: string;
  productId: string;
  bytes: number;
  interval: PriceInterval;
  commitmentPlan: boolean;
  recurring: boolean;
  amount: number;
  currency: string;
  decimalAmount: number;
  type: UserType;
  intervalCount?: number;
  minimumSeats?: number;
  maximumSeats?: number;

  private constructor(attributes: PriceAttributes) {
    this.id = attributes.id;
    this.productId = attributes.productId;
    this.bytes = attributes.bytes;
    this.commitmentPlan = attributes.commitmentPlan;
    this.amount = attributes.amount;
    this.currency = attributes.currency;
    this.decimalAmount = attributes.decimalAmount;
    this.interval = attributes.interval;
    this.intervalCount = attributes.intervalCount;
    this.recurring = attributes.recurring;
    this.type = attributes.type;
    this.buildBusinessSeats(attributes.minimumSeats, attributes.maximumSeats);
  }

  static toDomain(attributes: PriceAttributes): Price {
    return new Price(attributes);
  }

  public isBusinessPlan(): boolean {
    return this.type === UserType.Business;
  }

  public isCommitmentPlan(): boolean {
    return this.commitmentPlan;
  }

  public isRecurring(): boolean {
    return this.recurring;
  }

  public toJSON(): PriceAttributes {
    return {
      id: this.id,
      productId: this.productId,
      bytes: this.bytes,
      interval: this.interval,
      commitmentPlan: this.commitmentPlan,
      recurring: this.recurring,
      amount: this.amount,
      currency: this.currency,
      decimalAmount: this.decimalAmount,
      type: this.type,
      ...(this.minimumSeats !== undefined && { minimumSeats: this.minimumSeats }),
      ...(this.maximumSeats !== undefined && { maximumSeats: this.maximumSeats }),
    };
  }

  private buildBusinessSeats(minimumSeats?: number, maximumSeats?: number) {
    if (minimumSeats !== undefined) this.minimumSeats = minimumSeats;
    if (maximumSeats !== undefined) this.maximumSeats = maximumSeats;
  }
}
