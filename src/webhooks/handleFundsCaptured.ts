import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';

import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { ConflictError } from '../errors/Errors';
import { UserType } from '../core/users/User';
import axios from 'axios';
import { VERIFICATION_CHARGE } from '../constants';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';

export default async function handleFundsCaptured(
  paymentIntent: Stripe.PaymentIntent,
  paymentsService: PaymentService,
  objectStorageService: ObjectStorageService,
  stripe: Stripe,
  logger: FastifyBaseLogger,
): Promise<void> {
  const isMissingType = !paymentIntent.metadata.type;
  const isNotObjectStorage = paymentIntent.metadata.type !== 'object-storage';
  const isMissingPriceId = !paymentIntent.metadata.priceId;
  const isFullVerificationChargeCaptured = paymentIntent.amount_received === VERIFICATION_CHARGE;

  const shouldSkipHandling =
    isMissingType || isNotObjectStorage || isMissingPriceId || isFullVerificationChargeCaptured;

  if (shouldSkipHandling) {
    return;
  }

  logger.info(
    `Received successful payment intent ${paymentIntent.id} from customer ${paymentIntent.customer as string}`,
  );

  const customer = await stripePaymentsAdapter.getCustomer(paymentIntent.customer as string);

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) is being initialized...`);

  const isPaymentIntentCanceled = paymentIntent.status === 'canceled';

  try {
    if (!isPaymentIntentCanceled) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
    }
  } catch (error) {
    const err = error as Error;
    logger.error(
      `[OBJECT STORAGE] Unexpected error while attempting to cancel the verification payment intent for user ${customer.id}. Error: ${err.message}`,
    );

    throw error;
  }

  try {
    const { type } = await paymentsService.getUserSubscription(customer.id, UserType.ObjectStorage);
    const isSubscriptionActivated = type === 'subscription';

    if (!isSubscriptionActivated) {
      await paymentsService.createSubscription({
        customerId: customer.id,
        priceId: paymentIntent.metadata.priceId,
        additionalOptions: {
          default_payment_method: paymentIntent.payment_method as string,
          off_session: true,
          automatic_tax: {
            enabled: true,
          },
        },
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error(
      `[OBJECT STORAGE] Unexpected error while attempting to create a user subscription for user ${customer.id}. Error: ${err.message}`,
    );

    throw error;
  }

  try {
    await objectStorageService.initObjectStorageUser({
      email: customer.email,
      customerId: customer.id,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;

      if (status === 409) {
        logger.error('The user already has an Object Storage account activated');
        throw new ConflictError(error.message);
      }

      logger.error(`Unexpected error from Object Storage service [status=${status}]: ${JSON.stringify(data)}`);
    }

    throw error;
  }

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) has been initialized!`);
}
