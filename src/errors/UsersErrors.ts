import { Coupon } from '../core/coupons/Coupon';

export class CouponNotBeingTrackedError extends Error {
  constructor(couponName: Coupon['code']) {
    super(`Coupon ${couponName} is not being tracked`);

    Object.setPrototypeOf(this, CouponNotBeingTrackedError.prototype);
  }
}
