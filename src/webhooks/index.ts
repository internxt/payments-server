import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import handleSubscriptionCanceled from './handleSubscriptionCanceled';
import handleSubscriptionUpdated from './handleSubscriptionUpdated';
import handlePaymentMethodAttached from './handlePaymentMethodAttached';
import { PaymentService } from '../services/PaymentService';
import handleCheckoutSessionCompleted from './handleCheckoutSessionCompleted';
import CacheService from '../services/CacheService';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import handleSetupIntentCompleted from './handleSetupIntentCompleted';
import { User } from '../core/users/User';

export default function (
  stripe: Stripe,
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  config: AppConfig,
  cacheService: CacheService,
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
          fastify.log.info('Stripe event could not be verified');
          return rep.status(401).send();
        } else {
          throw err;
        }
      }
      fastify.log.info(`Stripe event received: ${event.type}, id: ${event.id}`);

      switch (event.type) {
        case 'customer.subscription.deleted':
          await handleSubscriptionCanceled(
            storageService,
            usersService,
            (event.data.object as Stripe.Subscription).customer as string,
            cacheService,
            fastify.log,
          );
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            storageService,
            usersService,
            event.data.object as Stripe.Subscription,
            cacheService,
            fastify.log,
          );
          break;
        case 'payment_method.attached':
          await handlePaymentMethodAttached(
            paymentService,
            (event.data.object as Stripe.PaymentMethod).customer as string,
            (event.data.object as Stripe.PaymentMethod).id,
          );
          break;

        case 'setup_intent.succeeded': {
          let customerId: string;
          const coupon = (event.data.object as Stripe.SetupIntent).metadata?.coupon
            ? {
                coupon: (event.data.object as Stripe.SetupIntent).metadata?.coupon as string,
              }
            : undefined;

          try {
            const getUser: User = await usersService.findUserByUuid(
              (event.data.object as Stripe.SetupIntent).metadata?.uuid as string,
            );

            const updateCustomer: Stripe.Response<Stripe.PaymentMethod> = await stripe.paymentMethods.attach(
              (event.data.object as Stripe.SetupIntent).payment_method as string,
              {
                customer: getUser.customerId,
              },
            );

            customerId = updateCustomer.customer as string;
          } catch (err) {
            const customer: Stripe.Customer = await stripe.customers.create({
              name: (event.data.object as Stripe.SetupIntent).metadata?.name,
              email: (event.data.object as Stripe.SetupIntent).metadata?.email,
              payment_method: (event.data.object as Stripe.SetupIntent).payment_method as string,
            });

            customerId = customer.id;
          }

          await stripe.subscriptions.create({
            customer: customerId,
            default_payment_method: (event.data.object as Stripe.SetupIntent).payment_method as string,
            items: [
              {
                price: (event.data.object as Stripe.SetupIntent).metadata?.priceId as string,
                metadata: {
                  is_teams: 0,
                },
              },
            ],
            expand: ['latest_invoice.payment_intent'],
            ...coupon,
          });

          await handleSetupIntentCompleted(
            event.data.object as Stripe.SetupIntent,
            usersService,
            paymentService,
            fastify.log,
            cacheService,
            config,
            customerId,
          );

          break;
        }
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
            usersService,
            paymentService,
            fastify.log,
            cacheService,
            config,
          );
          break;
        case 'checkout.session.async_payment_succeeded':
          await handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
            usersService,
            paymentService,
            fastify.log,
            cacheService,
            config,
          );
          break;
        case 'charge.refunded':
          await handleLifetimeRefunded(
            storageService,
            usersService,
            (event.data.object as Stripe.Charge).customer as string,
            cacheService,
            fastify.log,
          );
          break;
        default:
          fastify.log.info(`No handler registered for event: ${event.type}, id: ${event.id}`);
      }

      return rep.status(204).send();
    });
  };
}
