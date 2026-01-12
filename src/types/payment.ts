import Stripe from 'stripe';
import { UserType } from '../core/users/User';

export interface PaymentIntentCrypto {
  type: 'crypto';
  id: string;
  token: string;
  payload: {
    paymentRequestUri: string;
    payAmount: number;
    payCurrency: string;
    paymentAddress: string;
    url: string;
    qrUrl: string;
  };
}

export interface PaymentIntentFiat {
  type: 'fiat';
  clientSecret: string | null;
  id: string;
  invoiceStatus?: string;
}

export type PaymentIntent = PaymentIntentCrypto | PaymentIntentFiat;

export interface PromotionCode {
  promoCodeName: Stripe.PromotionCode['code'];
  codeId: Stripe.PromotionCode['id'];
  amountOff: Stripe.PromotionCode['coupon']['amount_off'];
  percentOff: Stripe.PromotionCode['coupon']['percent_off'];
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
