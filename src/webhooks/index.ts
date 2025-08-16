import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import { StorageService } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import handleSubscriptionCanceled from './handleSubscriptionCanceled';
import handleSubscriptionUpdated from './handleSubscriptionUpdated';
import { PaymentService } from '../services/payment.service';
import CacheService from '../services/cache.service';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import handleCheckoutSessionCompleted from './handleCheckoutSessionCompleted';
import { ObjectStorageService } from '../services/objectStorage.service';
import handleInvoicePaymentFailed from './handleInvoicePaymentFailed';
import { handleDisputeResult } from './handleDisputeResult';
import handleSetupIntentSucceeded from './handleSetupIntentSucceded';
import { TiersService } from '../services/tiers.service';
import handleFundsCaptured from './handleFundsCaptured';
import { DetermineLifetimeConditions } from '../core/users/DetermineLifetimeConditions';
import { ObjectStorageWebhookHandler } from './events/ObjectStorageWebhookHandler';
import { InvoiceCompletedHandler } from './events/invoices/InvoiceCompletedHandler';
import { BadRequestError } from '../errors/Errors';
import Logger from '../Logger';

export default function (
  stripe: Stripe,
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  config: AppConfig,
  cacheService: CacheService,
  objectStorageService: ObjectStorageService,
  tiersService: TiersService,
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
          Logger.info('Stripe event could not be verified');
          return rep.status(401).send();
        } else {
          throw err;
        }
      }

      Logger.info(`Stripe event received: ${event.type}, id: ${event.id}`);

      switch (event.type) {
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object, objectStorageService, paymentService, fastify.log);
          break;

        case 'payment_intent.amount_capturable_updated':
          await handleFundsCaptured(event.data.object, paymentService, objectStorageService, stripe, fastify.log);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionCanceled(
            storageService,
            usersService,
            paymentService,
            event.data.object,
            cacheService,
            objectStorageService,
            tiersService,
            fastify.log,
            config,
          );
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            storageService,
            usersService,
            event.data.object,
            cacheService,
            paymentService,
            objectStorageService,
            fastify.log,
            config,
          );
          break;

        case 'payment_intent.succeeded': {
          const eventData = event.data.object;
          const paymentMethod = await stripe.paymentMethods.retrieve(eventData.payment_method as string);
          const userAddressBillingDetails = paymentMethod.billing_details.address;

          if (userAddressBillingDetails) {
            await stripe.customers.update(eventData.customer as string, {
              address: {
                city: userAddressBillingDetails.city as string,
                line1: userAddressBillingDetails.line1 as string,
                line2: userAddressBillingDetails.line2 as string,
                country: userAddressBillingDetails.country as string,
                postal_code: userAddressBillingDetails.postal_code as string,
                state: userAddressBillingDetails.state as string,
              },
            });
          }
          break;
        }

        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          const customer = await paymentService.getCustomer(invoice.customer as string);

          if (customer.deleted) {
            throw new BadRequestError(`The customer with ID ${invoice.customer as string} does not exist`);
          }

          const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
          const objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService);
          const handler = new InvoiceCompletedHandler({
            logger: fastify.log,
            determineLifetimeConditions,
            objectStorageWebhookHandler,
            paymentService,
            storageService,
            tiersService,
            usersService,
            cacheService,
          });

          await handler.run({
            invoice,
            customer,
            status: invoice.status as string,
          });

          break;

        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(
            event.data.object,
            stripe,
            usersService,
            paymentService,
            fastify.log,
            cacheService,
            config,
          );
          break;

        case 'setup_intent.succeeded':
          await handleSetupIntentSucceeded(event.data.object, paymentService);
          break;

        case 'checkout.session.async_payment_succeeded':
          await handleCheckoutSessionCompleted(
            event.data.object,
            stripe,
            usersService,
            paymentService,
            fastify.log,
            cacheService,
            config,
          );
          break;

        case 'charge.refunded':
          if (event.data.object.metadata.type === 'object-storage') {
            // no op
          } else {
            const isFullAmountRefunded = event.data.object.refunded;

            if (isFullAmountRefunded) {
              await handleLifetimeRefunded(
                storageService,
                usersService,
                event.data.object,
                cacheService,
                paymentService,
                fastify.log,
                tiersService,
                config,
              );
            }
          }
          break;

        case 'charge.dispute.closed':
          const dispute = event.data.object;
          await handleDisputeResult({
            dispute,
            stripe,
            paymentService,
            usersService,
            storageService,
            cacheService,
            tiersService,
            log: fastify.log,
            config,
          });
          break;

        default:
          Logger.info(`No handler registered for event: ${event.type}, id: ${event.id}`);
      }

      return rep.status(204).send();
    });
  };
}
