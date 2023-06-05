import Stripe from 'stripe';

export interface LicenseCode {
  priceId: Stripe.Price['id'];
  provider: 'OWN' | string;
  code: string;
  redeemed: boolean;
}
