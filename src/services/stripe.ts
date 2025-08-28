import StripeNew from 'stripe-next-version';

export const stripeNewVersion = new StripeNew(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil',
});
