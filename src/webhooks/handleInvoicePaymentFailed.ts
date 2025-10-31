import Stripe from 'stripe';
import { FastifyLoggerInstance } from 'fastify';
import { PaymentService } from '../services/payment.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { UsersService } from '../services/users.service';

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
    const productId = line.pricing?.price_details?.product;

    if (!productId) continue;

    const product = await paymentService.getProduct(productId);
    if (isProduct(product)) return line;
  }

  return undefined;
}

/**
 * Handles payment failures for Drive and Object Storage products
 * - Drive failures: sends notification to Drive users
 * - Object Storage failures: suspends Object Storage account only
 * @param invoice
 * @param objectStorageService
 * @param paymentService
 * @param usersService
 * @param logger
 * @returns
 */
export default async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
  usersService: UsersService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  if (!invoice.customer) {
    throw new Error('No customer found for this payment');
  }

  const customer = (await paymentService.getCustomer(invoice.customer as string)) as Stripe.Customer;

  const relevantLineItem = await findObjectStorageLineItem(invoice, paymentService);

  if (!relevantLineItem) {
    try {
      const user = await usersService.findUserByCustomerID(customer.id);
      if (user) {
        await usersService.notifyFailedPayment(user.uuid);
        logger.info(`Drive payment failure notification sent for customer ${customer.id} (user UUID: ${user.uuid})`);
      } else {
        logger.warn(`User not found for customer ${customer.id}. Skipping failed payment notification.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send payment notification for customer ${customer.id}. Error: ${errorMessage}`);
    }
    logger.info(`Invoice ${invoice.id} does not contain an object storage product. Skipping object storage suspension...`);
    return;
  }

  logger.info(
    `Handling invoice not paid ${invoice.id} for customer ${customer.id} > Suspending object storage account..`,
  );

  await objectStorageService.suspendAccount({ customerId: customer.id });

  logger.info(
    `Handling invoice not paid ${invoice.id} for customer ${customer.id} > Object storage account suspended..`,
  );
}
