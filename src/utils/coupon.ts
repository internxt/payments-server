import Stripe from 'stripe';
import { NotFoundError } from '../errors/Errors';

export function getPromotionCodeCouponId(promotionCode: Stripe.PromotionCode): Stripe.Coupon['id'] {
  const coupon = promotionCode.promotion.coupon;

  if (!coupon) {
    throw new NotFoundError(`Promotion code ${promotionCode.code} has no coupon`);
  }

  return typeof coupon === 'string' ? coupon : coupon.id;
}

export function getPromotionCodeCoupon(promotionCode: Stripe.PromotionCode): Stripe.Coupon {
  const coupon = promotionCode.promotion.coupon;

  if (!coupon || typeof coupon === 'string') {
    throw new NotFoundError(`The coupon of the promotion code ${promotionCode.code} is not available`);
  }

  return coupon;
}

export function getDiscountCouponId(
  discount?: Stripe.Discount | Stripe.DeletedDiscount | string,
): Stripe.Coupon['id'] | undefined {
  const coupon = typeof discount === 'string' ? undefined : discount?.source?.coupon;

  return typeof coupon === 'string' ? coupon : coupon?.id;
}
