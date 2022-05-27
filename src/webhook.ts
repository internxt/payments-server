import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import stripe from './stripe';

export default async function (fastify: FastifyInstance) {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
    done(null, body);
  });

  const { STRIPE_WEBHOOK_KEY } = process.env;

  if (!STRIPE_WEBHOOK_KEY) throw new Error('STRIPE_WEBHOOK_KEY must be defined');

  fastify.post<{ Body: Buffer }>('/webhook', async (req, rep) => {
    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_KEY);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        return rep.status(401);
      } else {
        throw err;
      }
    }
    fastify.log.info(`Stripe event received: ${event.type}`);

    return rep.status(201);
  });
}
