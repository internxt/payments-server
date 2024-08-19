import Stripe from "stripe";
import { FastifyLoggerInstance } from "fastify";

import { PaymentService } from "../services/PaymentService";
import { ObjectStorageService } from "../services/ObjectStorageService";

function isCustomer(customer: Stripe.Customer | Stripe.DeletedCustomer): customer is Stripe.Customer {
  return !customer.deleted;
}

export default async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  paymentsService: PaymentService,
  objectStorageService: ObjectStorageService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  if (!paymentIntent.metadata.type || paymentIntent.metadata.type !== 'object-storage') {
    return;
  }

  logger.info(`Received successful payment intent ${paymentIntent.id} from customer ${paymentIntent.customer}`);

  const customer = await paymentsService.getCustomer(paymentIntent.customer as string);

  if (!isCustomer(customer)) {
    throw new Error(`Customer ${paymentIntent.customer} has been deleted`);
  } 

  if (!customer.email) {
    throw new Error(`Customer ${paymentIntent.customer} has no email`);
  } 

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) is being initialized...`);

  await objectStorageService.initObjectStorageUser({
    email: customer.email,
    customerId: customer.id
  });

  logger.info(`Object Storage for user ${customer.email} (customer ${customer.id}) has been initialized!`);
}
