import Stripe from 'stripe';
import config from './config';

const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

export default stripe;
