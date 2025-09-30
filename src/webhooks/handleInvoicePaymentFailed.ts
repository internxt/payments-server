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
    const price = line.price;
    if (!price?.product) continue;
    const productId = typeof price.product === 'string' ? price.product : price.product.id;

    const product = await paymentService.getProduct(productId);
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
  usersService: UsersService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  if (!invoice.customer) {
    throw new Error('No customer found for this payment');
  }

  const customer = (await paymentService.getCustomer(invoice.customer as string)) as Stripe.Customer;

  try {
    const user = await usersService.findUserByCustomerID(customer.id);
    if (user) {
      await usersService.notifyFailedPayment(user.uuid);
      logger.info(`Failed payment notification sent for customer ${customer.id} (user UUID: ${user.uuid})`);
    } else {
      logger.warn(`User not found for customer ${customer.id}. Skipping failed payment notification.`);
    }
  } catch (error) {
    logger.error(`Failed to send payment notification for customer ${customer.id}`);
  }

  const relevantLineItem = await findObjectStorageLineItem(invoice, paymentService);

  if (!relevantLineItem) {
    logger.info(`Invoice ${invoice.id} does not contain an object storage product. Skipping...`);
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
