import Stripe from 'stripe';
import { UserType } from '../core/users/User';

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

export interface PriceByIdResponse {
  minimumSeats?: number;
  maximumSeats?: number;
  id: string;
  currency: string;
  amount: number;
  bytes: number;
  interval: string | undefined;
  decimalAmount: number;
  type: UserType;
  product: string;
}

export type Reason = {
  name: 'prevent-cancellation' | 'pc-cloud-25';
};
