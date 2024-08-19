import Stripe from "stripe";
import { FastifyLoggerInstance } from "fastify";

import { PaymentService } from "../services/PaymentService";

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (product as Stripe.Product).metadata && 
    !!(product as Stripe.Product).metadata.type && 
    (product as Stripe.Product).metadata.type === 'object-storage';
}

/**
 * This function only handles the Object Storage Sub Verification Charge
 * @param subscription The possible object storage subscription
 * @param paymentsService The payments service
 * @param logger The logger
 * @returns 
 */
export default async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  paymentsService: PaymentService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  const customer = await paymentsService.getCustomer(subscription.customer as string);

  if (customer.deleted) {
    throw new Error('Customer has been deleted');
  }

  if (subscription.items.data.length !== 1) {
    throw new Error('Unexpected items length for object storage');
  }

  const productId = subscription.items.data[0].price.product as string;
  const product = await paymentsService.getProduct(productId);

  if (!isProduct(product)) {
    logger.info(`Subscription ${subscription.id} is not an object-storage product`);
    return;
  }

  if (!customer.email) {
    throw new Error('Missing customer email on subscription created');
  }

  await paymentsService.billCardVerificationCharge(
    customer.id, 
    subscription.currency
  );

  logger.info(`Customer ${customer.id} with sub ${subscription.id} has been billed successfully`);
}
