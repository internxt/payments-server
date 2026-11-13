import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import handleSubscriptionCanceled from './handleSubscriptionCanceled';
import handleSubscriptionUpdated from './handleSubscriptionUpdated';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import handleInvoicePaymentFailed from './handleInvoicePaymentFailed';
import { handleDisputeResult } from './handleDisputeResult';
import handleSetupIntentSucceeded from './handleSetupIntentSucceded';
import handleFundsCaptured from './handleFundsCaptured';
import Logger from '../Logger';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { type Dependencies } from '../dependencies';

export function webhookHandler({
  stripe,
  storageService,
  usersService,
  paymentService,
  config,
  cacheService,
  objectStorageService,
  tiersService,
  preCreatedUserService,
  invoiceCompletedHandler,
}: Pick<
  Dependencies,
  | 'stripe'
  | 'storageService'
  | 'usersService'
  | 'paymentService'
  | 'config'
  | 'cacheService'
  | 'objectStorageService'
  | 'tiersService'
  | 'preCreatedUserService'
  | 'invoiceCompletedHandler'
>) {
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
        case 'invoice.payment_failed': {
          const invoice = await paymentService.getInvoice(event.data.object.id);
          await handleInvoicePaymentFailed(invoice, objectStorageService, paymentService, usersService);
          break;
        }

        case 'payment_intent.amount_capturable_updated':
          await handleFundsCaptured(event.data.object, paymentService, objectStorageService, stripe);
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
            preCreatedUserService,
          );
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            usersService,
            event.data.object,
            cacheService,
            paymentService,
            objectStorageService,
          );
          break;

        case 'payment_intent.succeeded': {
          const eventData = event.data.object;

          const paymentMethod = await stripePaymentsAdapter.retrievePaymentMethod(eventData.payment_method as string);
          const userAddressBillingDetails = paymentMethod.getAddress();

          if (userAddressBillingDetails) {
            await stripePaymentsAdapter.updateCustomer(eventData.customer as string, {
              address: {
                city: userAddressBillingDetails.city,
                line1: userAddressBillingDetails.line1,
                line2: userAddressBillingDetails.line2,
                country: userAddressBillingDetails.country,
                postalCode: userAddressBillingDetails.postalCode,
                state: userAddressBillingDetails.state,
              },
            });
          }
          break;
        }

        case 'invoice.paid': {
          const invoice = await paymentService.getInvoice(event.data.object.id);
          const customer = await stripePaymentsAdapter.getCustomer(invoice.customer as string);

          await invoiceCompletedHandler.run({
            invoice,
            customer,
            status: invoice.status as string,
          });

          break;
        }

        case 'setup_intent.succeeded':
          await handleSetupIntentSucceeded(event.data.object, paymentService);
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
                tiersService,
                preCreatedUserService,
              );
            }
          }
          break;

        case 'charge.dispute.closed':
          const dispute = event.data.object;
          await handleDisputeResult({
            dispute,
            paymentService,
            usersService,
            storageService,
            cacheService,
            tiersService,
            preCreatedUserService,
          });
          break;

        default:
          Logger.info(`No handler registered for event: ${event.type}, id: ${event.id}`);
      }

      return rep.status(204).send();
    });
  };
}
