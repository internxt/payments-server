import Stripe from 'stripe';
import { Customer } from '../entities/customer';

export interface PaymentsAdapter {
  createCustomer: (params: Stripe.CustomerCreateParams) => Promise<Customer>;
  updateCustomer: (customerId: string, params: Stripe.CustomerUpdateParams) => Promise<Customer>;
  getCustomer: (customerId: string) => Promise<Customer>;
  searchCustomer: (params: Stripe.CustomerSearchParams) => Promise<Customer[]>;
}
