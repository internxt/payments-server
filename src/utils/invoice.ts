import Stripe from 'stripe';

export function getInvoicePriceId(invoice: Stripe.Invoice): Stripe.Price['id'] | undefined {
  const price = invoice.lines?.data?.[0]?.pricing?.price_details?.price;

  return typeof price === 'string' ? price : price?.id;
}

export function getInvoiceProductId(invoice: Stripe.Invoice): Stripe.Product['id'] | undefined {
  return invoice.lines?.data?.[0]?.pricing?.price_details?.product;
}
