import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';

import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { BadRequestError, ConflictError, GoneError } from '../errors/Errors';
import { UserType } from '../core/users/User';
import axios from 'axios';
import { VERIFICATION_CHARGE } from '../constants';

function isCustomer(customer: Stripe.Customer | Stripe.DeletedCustomer): customer is Stripe.Customer {
  return !customer.deleted;
}

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

  const customer = await paymentsService.getCustomer(paymentIntent.customer as string);

  if (!isCustomer(customer)) {
    throw new GoneError(`Customer ${paymentIntent.customer as string} has been deleted`);
  }

  if (!customer.email) {
    throw new BadRequestError(`Customer ${paymentIntent.customer as string} has no email`);
  }

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) is being initialized...`);

  const isPaymentIntentCanceled = paymentIntent.status === 'canceled';

  if (!isPaymentIntentCanceled) {
    await stripe.paymentIntents.cancel(paymentIntent.id);
  }

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

  try {
    await objectStorageService.initObjectStorageUser({
      email: customer.email,
      customerId: customer.id,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;

      if (status === 409) {
        logger.info('The user already has an Object Storage account activated');
        throw new ConflictError(error.message);
      }

      logger.error(`Unexpected error from Object Storage service [status=${status}]: ${JSON.stringify(data)}`);
    }

    throw error;
  }

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) has been initialized!`);
}
