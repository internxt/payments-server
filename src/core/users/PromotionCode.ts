import Stripe from 'stripe';

export interface PromotionCode {
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.PromotionCode['coupon']['amount_off'];
  percentOff: Stripe.PromotionCode['coupon']['percent_off'];
}
