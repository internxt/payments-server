export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

export interface PaymentIntentAttributes {
  id: string;
  customer: string;
  status: PaymentIntentStatus;
  clientSecret: string | null;
}

export class PaymentIntent implements PaymentIntentAttributes {
  id: string;
  customer: string;
  status: PaymentIntentStatus;
  clientSecret: string | null;

  constructor(attributes: PaymentIntentAttributes) {
    this.id = attributes.id;
    this.customer = attributes.customer;
    this.status = attributes.status;
    this.clientSecret = attributes.clientSecret;
  }

  static toDomain(attributes: PaymentIntentAttributes): PaymentIntent {
    return new PaymentIntent(attributes);
  }

  isCaptureRequired(): boolean {
    return this.status === 'requires_capture';
  }
}
