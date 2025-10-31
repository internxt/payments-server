import Stripe from 'stripe';

export const isInvoicePaidOutOfBand = (invoice: Stripe.Invoice) => {
  return (
    invoice.status === 'paid' &&
    invoice.amount_due > 0 &&
    invoice.total_discount_amounts?.length === 0 &&
    invoice.payments?.data.length === 0
  );
};
