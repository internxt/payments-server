import { Stripe } from 'stripe';

export interface Coupon {
  id: string;
  provider: 'stripe'
  code: Stripe.Coupon['id'];
}
