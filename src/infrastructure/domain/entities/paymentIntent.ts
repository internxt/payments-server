export interface PaymentIntentAttributes {
  id: string;
  metadata: Record<string, string>;
  customer: string;
  status: string;
  payment_method: string;
  amount_received: number;
}

export class PaymentIntent {
  id: string;
  metadata: Record<string, string>;
  customer: string;
  status: string;
  payment_method: string;
  amount_received: number;

  constructor(attributes: PaymentIntentAttributes) {
    this.id = attributes.id;
    this.metadata = attributes.metadata;
    this.customer = attributes.customer;
    this.status = attributes.status;
    this.payment_method = attributes.payment_method;
    this.amount_received = attributes.amount_received;
  }

  static toDomain(attributes: PaymentIntentAttributes): PaymentIntent {
    return new PaymentIntent(attributes);
  }

  public isObjectStorage(): boolean {
    return this.metadata.type === 'object-storage';
  }
}
