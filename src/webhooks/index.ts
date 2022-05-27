import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import stripe from '../stripe';
import handleSubscriptionCanceled from './handleSubscriptionCanceled';
import handleSubscriptionUpdated from './handleSubscriptionUpdated';

export default function (storageService: StorageService, usersService: UsersService) {
  return async function (fastify: FastifyInstance) {
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

      switch (event.type) {
        case 'customer.subscription.deleted':
          await handleSubscriptionCanceled(
            storageService,
            usersService,
            (event.data.object as Stripe.Subscription).customer as string,
          );
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(storageService, usersService, event.data.object as Stripe.Subscription);
          break;
        default:
          fastify.log.info(`Not handler for event: ${event.type}`);
      }

      return rep.status(201);
    });
  };
}
