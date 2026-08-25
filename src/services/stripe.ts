import Stripe from 'stripe-next-version';
import config from '../config';

let stripeNewVersionInstance: InstanceType<typeof Stripe> | null = null;

const createInstance = (stripeKey: string): InstanceType<typeof Stripe> =>
  new Stripe(stripeKey, {
    apiVersion: '2025-08-27.basil',
  });

export const initStripeNewVersion = (stripeKey: string): void => {
  stripeNewVersionInstance = createInstance(stripeKey);
};

export const getStripeNewVersion = (): InstanceType<typeof Stripe> => {
  if (!stripeNewVersionInstance) {
    stripeNewVersionInstance = createInstance(config.STRIPE_SECRET_KEY);
  }
  return stripeNewVersionInstance;
};
