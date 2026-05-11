import { RequestedPlanData } from '../../../types/subscription';

export class Price {
  constructor(public readonly price: RequestedPlanData) {}

  static toDomain(price: RequestedPlanData) {
    return new Price(price);
  }

  get id() {
    return this.price.id;
  }

  get productId() {
    return this.price.productId;
  }

  get bytes() {
    return this.price.bytes;
  }

  get amount() {
    return this.price.amount;
  }

  get currency() {
    return this.price.currency;
  }

  get interval() {
    return this.price.interval;
  }

  get businessSeats() {
    return {
      minimumSeats: this.price.minimumSeats,
      maximumSeats: this.price.maximumSeats,
    };
  }

  get decimalAmount() {
    return this.price.decimalAmount;
  }

  get type() {
    return this.price.type;
  }

  get commitmentPlan() {
    return this.price.commitmentPlan;
  }
}
