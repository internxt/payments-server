import { Coupon } from '../core/coupons/Coupon';
import { BadRequestError } from './Errors';

export class CouponNotBeingTrackedError extends Error {
  constructor(couponName: Coupon['code']) {
    super(`Coupon ${couponName} is not being tracked`);

    Object.setPrototypeOf(this, CouponNotBeingTrackedError.prototype);
  }
}

export class CancellationTrialAlreadyRedeemedError extends BadRequestError {
  constructor() {
    super('Cancellation trial already redeemed');

    Object.setPrototypeOf(this, CancellationTrialAlreadyRedeemedError.prototype);
  }
}
