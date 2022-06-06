import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import handleSubscriptionCanceled from './handleSubscriptionCanceled';
import handleSubscriptionUpdated from './handleSubscriptionUpdated';
import handlePaymentMethodAttached from './handlePaymentMethodAttached';
import { PaymentService } from '../services/PaymentService';

export default function (
  stripe: Stripe,
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  config: AppConfig,
) {
  return async function (fastify: FastifyInstance) {
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
      done(null, body);
    });

    fastify.post<{ Body: Buffer }>('/webhook', async (req, rep) => {
      const sig = req.headers['stripe-signature'] as string;

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_KEY);
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
        case 'payment_method.attached':
          await handlePaymentMethodAttached(
            paymentService,
            (event.data.object as Stripe.PaymentMethod).customer as string,
            (event.data.object as Stripe.PaymentMethod).id,
          );
          break;
        default:
          fastify.log.info(`No handler registered for event: ${event.type}`);
      }

      return rep.status(204).send();
    });
  };
}
