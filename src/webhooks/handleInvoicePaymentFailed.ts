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

async function findObjectStorageLineItem(
  invoice: Stripe.Invoice,
  paymentService: PaymentService,
): Promise<Stripe.InvoiceLineItem | undefined> {
  for (const line of invoice.lines.data) {
    const price = line.price;
    if (!price?.product) continue;

    const product = await paymentService.getProduct(price.product as string);
    if (isProduct(product)) return line;
  }

  return undefined;
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

  const relevantLineItem = await findObjectStorageLineItem(invoice, paymentService);

  if (!relevantLineItem) {
    logger.info(`Invoice ${invoice.id} does not contain an object storage product. Skipping...`);
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
