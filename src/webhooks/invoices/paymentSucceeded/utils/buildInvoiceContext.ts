import Stripe from 'stripe';
import { Tier } from '../../../../core/users/Tier';
import { PaymentService, PriceMetadata } from '../../../../services/payment.service';
import { FastifyBaseLogger } from 'fastify';
import { UserType } from '../../../../core/users/User';

export interface InvoiceContext {
  /* Stripe primitives */
  invoice: Stripe.Invoice;
  customer: Stripe.Customer;
  price: Stripe.Price & { metadata: PriceMetadata };
  product: Stripe.Product;

  /* Business flags  */
  productType: UserType; // individual | business | object‑storage…
  isBusinessPlan: boolean;
  isObjectStoragePlan: boolean;
  isLifetime: boolean; // price.metadata.planType === 'one_time'
  billingType: Tier['billingType']; // 'subscription' | 'lifetime'

  /* Convenience  */
  invoiceId: string;
  customerId: string;
  customerEmail: string;
  seats: number;
  lineItems: Stripe.InvoiceLineItem;
}

/**
 * Construye InvoiceContext a partir del invoice recibido en el webhook.
 * Lanza errores si falta algo imprescindible para que upstream pueda decidir
 * si devolver 2XX (Stripe no re‑intentará) o 4XX/5XX (Stripe re‑intentará).
 */
export async function buildInvoiceContext(
  invoice: Stripe.Invoice,
  {
    paymentService,
    logger,
  }: {
    paymentService: PaymentService;
    logger: FastifyBaseLogger;
  },
): Promise<InvoiceContext> {
  /* 1 ─ Validaciones básicas */
  if (invoice.status !== 'paid') throw new Error(`Invoice ${invoice.id} no está pagada (status=${invoice.status}).`);

  /* 2 ─ Customer */
  const customerId = invoice.customer as string;
  const customer = await paymentService.getCustomer(customerId);
  if (customer.deleted) throw new Error(`Customer ${customerId} borrado o inexistente para invoice ${invoice.id}.`);

  const lineItems = (await paymentService.getInvoiceLineItems(invoice.id)).data.at(0);
  if (!lineItems?.price) throw new Error(`Invoice ${invoice.id} Without price in line items.`);

  const price = lineItems.price as InvoiceContext['price'];
  const product = price.product as Stripe.Product;
  const productType = product.metadata.type as UserType;

  const isLifetime = price.metadata.planType === 'one_time';
  const billingType: Tier['billingType'] = isLifetime ? 'lifetime' : 'subscription';

  const ctx: InvoiceContext = {
    /* Stripe */
    invoice,
    customer,
    price,
    product,

    /* Flags */
    productType,
    isBusinessPlan: productType === UserType.Business,
    isObjectStoragePlan: productType === UserType.ObjectStorage,
    isLifetime,
    billingType,

    /* Convenience */
    invoiceId: invoice.id,
    customerId,
    customerEmail: customer.email ?? invoice.customer_email ?? '',
    seats: lineItems.quantity ?? 1,
    lineItems,
  };

  logger.debug({ ctx }, `[InvoiceContext] Created successfully for user ${customer.id}`);
  return ctx;
}
