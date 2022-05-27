import Stripe from 'stripe';

const { STRIPE_SECRET_KEY } = process.env;
if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY must be defined');

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

export default stripe;
