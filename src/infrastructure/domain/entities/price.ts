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
  minimumSeats?: number;
  maximumSeats?: number;

  private constructor(attributes: PriceAttributes) {
    this.id = attributes.id;
    this.productId = attributes.productId;
    this.bytes = attributes.bytes;
    this.interval = attributes.interval;
    this.commitmentPlan = attributes.commitmentPlan;
    this.amount = attributes.amount;
    this.currency = attributes.currency;
    this.decimalAmount = attributes.decimalAmount;
    this.recurring = attributes.recurring;
    this.type = attributes.type;
    this.minimumSeats = attributes.minimumSeats;
    this.maximumSeats = attributes.maximumSeats;
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
}
