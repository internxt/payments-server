import Stripe from 'stripe-next-version';
import config from '../config';

let stripeNewVersionInstance: typeof Stripe | null = null;

export const getStripeNewVersion = (): typeof Stripe => {
  if (!stripeNewVersionInstance) {
    stripeNewVersionInstance = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
    });
  }
  return stripeNewVersionInstance;
};

export const stripeNewVersion = getStripeNewVersion();
