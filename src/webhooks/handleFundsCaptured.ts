import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';

import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { BadRequestError, GoneError } from '../errors/Errors';

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
  if (
    !paymentIntent.metadata.type ||
    paymentIntent.metadata.type !== 'object-storage' ||
    !paymentIntent.metadata.priceId
  ) {
    return;
  }

  logger.info(`Received successful payment intent ${paymentIntent.id} from customer ${paymentIntent.customer}`);

  const customer = await paymentsService.getCustomer(paymentIntent.customer as string);

  if (!isCustomer(customer)) {
    throw new GoneError(`Customer ${paymentIntent.customer} has been deleted`);
  }

  if (!customer.email) {
    throw new BadRequestError(`Customer ${paymentIntent.customer} has no email`);
  }

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) is being initialized...`);

  await stripe.paymentIntents.cancel(paymentIntent.id);

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

  await objectStorageService.initObjectStorageUser({
    email: customer.email,
    customerId: customer.id,
  });

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) has been initialized!`);
}
