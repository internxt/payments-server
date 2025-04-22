import Stripe from 'stripe';
import { ObjectStorageService } from '../../services/objectStorage.service';
import { PaymentService } from '../../services/payment.service';
import { FastifyBaseLogger } from 'fastify';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (
    (product as Stripe.Product).metadata &&
    !!(product as Stripe.Product).metadata.type &&
    (product as Stripe.Product).metadata.type === 'object-storage'
  );
}

export async function handleObjectStorageInvoiceCompleted(
  customer: Stripe.Customer,
  invoice: Stripe.Invoice,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
  log: FastifyBaseLogger,
) {
  if (invoice.lines.data.length !== 1) {
    log.info(`Invoice ${invoice.id} not handled by object-storage handler due to lines length`);
    return;
  }

  const [item] = invoice.lines.data;
  const { customer_email } = invoice;
  const { price } = item;

  if (!price?.product) {
    log.info(`Invoice ${invoice.id} not handled by object-storage handler`);
    return;
  }

  const product = await paymentService.getProduct(price.product as string);

  if (!isProduct(product)) {
    log.info(`Invoice ${invoice.id} for product ${JSON.stringify(price.product)} is not an object-storage product`);
    return;
  }

  await objectStorageService.reactivateAccount({ customerId: customer.id });

  log.info(
    `Object Storage user ${customer_email} (customer ${customer.id}) has been reactivated (if it was suspended)`,
  );
}
