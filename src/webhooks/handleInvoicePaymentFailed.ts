import Stripe from 'stripe';
import { FastifyLoggerInstance } from 'fastify';
import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (
    (product as Stripe.Product).metadata &&
    !!(product as Stripe.Product).metadata.type &&
    (product as Stripe.Product).metadata.type === 'object-storage'
  );
}

/**
 * This function only handles the Object Storage sub payment failed
 * @param invoice
 * @param objectStorageService
 * @param paymentService
 * @returns
 */
export default async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  if (!invoice.customer) {
    throw new Error('No customer found for this payment');
  }

  if (invoice.lines.data.length !== 1) {
    throw new Error(`Unexpected invoice lines count for invoice ${invoice.id}`);
  }

  const [{ price }] = invoice.lines.data;

  if (!price || !price.product) {
    throw new Error(`Product not found for not paid invoice ${invoice.id}`);
  }

  const product = await paymentService.getProduct(price.product as string);

  if (!isProduct(product)) {
    logger.warn(`Not handling product ${price.product} for not paid invoice ${invoice.id}`);
    return;
  }

  const customer = (await paymentService.getCustomer(invoice.customer as string)) as Stripe.Customer;

  logger.info(
    `Handling invoice not paid ${invoice.id} for customer ${customer.id} > Suspending object storage account..`,
  );

  await objectStorageService.suspendAccount({ customerId: customer.id });

  logger.info(
    `Handling invoice not paid ${invoice.id} for customer ${customer.id} > Object storage account suspended..`,
  );
}
