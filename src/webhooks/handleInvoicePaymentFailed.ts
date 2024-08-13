import Stripe from 'stripe';
import { PaymentService } from '../services/PaymentService';
import { ObjectStorageService } from '../services/ObjectStorageService';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (product as Stripe.Product).metadata !== undefined;
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
): Promise<void> {
  console.log('invoice', invoice);

  if (!invoice.customer) {
    throw new Error('No customer found for this payment');
  }

  if (!invoice.subscription) {
    // We are looking for invoices failed to be paid by a subscription
    return;
  }

  if (invoice.lines.data.length !== 1) {
    throw new Error(`Unexpected invoice lines count for invoice ${invoice.id}`);
  } 

  const [{ plan }] = invoice.lines.data;

  if (!plan) {
    throw new Error(`Product not found for not paid invoice ${invoice.id}`);
  }

  const product = await paymentService.getProduct(plan.product as string);

  if (!isProduct(product)) {
    throw new Error(`Unexpected product ${plan.id} for not paid invoice ${invoice.id}`);
  }

  const customer = await paymentService.getCustomer(invoice.customer as string) as Stripe.Customer;


  await objectStorageService.suspendAccount({ customerId: customer.id });
}
