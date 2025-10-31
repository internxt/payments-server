import Stripe from 'stripe';

export const isInvoicePaidOutOfBand = (invoice: Stripe.Invoice) => {
  console.log('isInvoicePaidOutOfBand', {
    isPaid: invoice.status === 'paid',
    amountDue: invoice.amount_due > 0,
    totalDiscountAmounts: invoice.total_discount_amounts?.length === 0,
  });
  return invoice.status === 'paid' && invoice.amount_due > 0 && invoice.total_discount_amounts?.length === 0;
};
