import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { ConflictError } from '../errors/Errors';
import { UserType } from '../core/users/User';
import axios from 'axios';
import { VERIFICATION_CHARGE } from '../constants';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { PaymentIntent } from '../infrastructure/domain/entities/paymentIntent';
import Logger from '../Logger';

export default async function handleFundsCaptured(
  paymentIntent: PaymentIntent,
  paymentsService: PaymentService,
  objectStorageService: ObjectStorageService,
): Promise<void> {
  const isMissingType = !paymentIntent.metadata.type;
  const isMissingPriceId = !paymentIntent.metadata.priceId;
  const isFullVerificationChargeCaptured = paymentIntent.amount_received === VERIFICATION_CHARGE;

  const shouldSkipHandling =
    isMissingType || !paymentIntent.isObjectStorage() || isMissingPriceId || isFullVerificationChargeCaptured;

  if (shouldSkipHandling) {
    Logger.info(
      `Received successful payment intent ${paymentIntent.id} from customer ${paymentIntent.customer} but it is not related to Object Storage.`,
    );
    return;
  }

  Logger.info(`Received successful payment intent ${paymentIntent.id} from customer ${paymentIntent.customer}`);

  const customer = await stripePaymentsAdapter.getCustomer(paymentIntent.customer);

  Logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) is being initialized...`);

  const isPaymentIntentCanceled = paymentIntent.status === 'canceled';

  try {
    if (!isPaymentIntentCanceled) {
      await stripePaymentsAdapter.cancelPaymentIntent(paymentIntent.id);
    }
  } catch (error) {
    const err = error as Error;
    Logger.error(
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
          default_payment_method: paymentIntent.payment_method,
          off_session: true,
          automatic_tax: {
            enabled: true,
          },
        },
      });
    }
  } catch (error) {
    const err = error as Error;
    Logger.error(
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
        Logger.error('The user already has an Object Storage account activated');
        throw new ConflictError(error.message);
      }

      Logger.error(`Unexpected error from Object Storage service [status=${status}]: ${JSON.stringify(data)}`);
    }

    throw error;
  }

  Logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) has been initialized!`);
}
