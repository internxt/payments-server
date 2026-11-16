import Stripe from 'stripe';

export interface PaymentIntent {
  type: 'fiat';
  clientSecret: string | null;
  id: string;
  invoiceStatus?: string;
}

export interface PromotionCode {
  promoCodeName: Stripe.PromotionCode['code'];
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.Coupon['amount_off'];
  percentOff: Stripe.Coupon['percent_off'];
}
