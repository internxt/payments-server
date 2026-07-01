import Stripe from 'stripe';

export interface InvoiceAttributes {
  id: string;
  paid: boolean;
  subscription: string | Stripe.Subscription | null;
  lines: Stripe.InvoiceLineItem[];
  status: Stripe.Invoice['status'];
  created: number;
  total: number;
  metadata: Stripe.Metadata | null;
  paidOutOfBand: boolean;
  charge: string | Stripe.Charge | null;
  pdf?: string;
  currency?: string;
}

export class Invoice implements InvoiceAttributes {
  id: string;
  subscription: string | Stripe.Subscription | null;
  lines: Stripe.InvoiceLineItem[];
  paid: boolean;
  status: Stripe.Invoice['status'];
  created: number;
  total: number;
  metadata: Stripe.Metadata | null;
  paidOutOfBand: boolean;
  charge: string | Stripe.Charge | null;
  pdf?: string;
  currency?: string;

  constructor({
    id,
    paid,
    subscription,
    lines,
    status,
    created,
    total,
    metadata,
    paidOutOfBand,
    charge,
    pdf,
    currency,
  }: InvoiceAttributes) {
    this.id = id;
    this.paid = paid;
    this.subscription = subscription;
    this.lines = lines;
    this.status = status;
    this.created = created;
    this.total = total;
    this.charge = charge;
    this.metadata = metadata;
    this.paidOutOfBand = paidOutOfBand;
    this.pdf = pdf;
    this.currency = currency;
  }

  static toDomain(attributes: InvoiceAttributes): Invoice {
    return new Invoice(attributes);
  }

  isLifetime() {
    return this.paid && !this.subscription && this.lines[0].price?.type === 'one_time';
  }

  isObjectStorageInvoice() {
    return this.lines?.[0]?.price?.metadata?.type === 'object-storage';
  }

  get product() {
    return this.lines[0].price?.product;
  }
}
