import Stripe from 'stripe';

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  address?: Address;
  phone?: string;
  metadata?: Record<string, string>;
  defaultPaymentMethod?: string;
}

export interface CustomerTaxDetails {
  isTaxExempt: boolean;
  taxIds: string[];
  address?: Address;
}

export interface PaymentMethod {
  id: string;
  address?: Address;
}

export interface CreateCustomerParams {
  name: string;
  email: string;
  address: Partial<Address>;
  metadata?: Record<string, string>;
}

export interface UpdateCustomerParams extends Partial<CreateCustomerParams> {
  phone?: string;
  tax?: {
    id: string;
    type: Stripe.TaxIdCreateParams.Type;
  };
}
