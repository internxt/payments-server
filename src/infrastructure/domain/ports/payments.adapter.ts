import Stripe from 'stripe';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../entities/customer';
import { Invoice } from '../entities/invoice';
import { PaymentMethod } from '../entities/paymentMethod';
import { Price } from '../entities/price';
import { Subscription } from '../entities/subscription';
import { InvoiceItems } from '../entities/invoiceItems';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<UpdateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
  retrievePaymentMethod: (paymentMethodId: PaymentMethod['id']) => Promise<PaymentMethod>;
  getPrices: (currency: string) => Promise<Price[]>;
  getPriceById: (priceId: Price['id'], currency: string) => Promise<Price>;
  updateSubscription: (
    subscriptionId: string,
    params: Partial<Stripe.SubscriptionUpdateParams>,
  ) => Promise<Subscription>;
  getSubscription: (subscriptionId: string) => Promise<Subscription>;
  createInvoice: (params?: Partial<Stripe.InvoiceCreateParams>) => Promise<Invoice>;
  addInvoiceItems: (
    invoiceId: InvoiceItems['id'],
    customerId: string,
    params: Partial<Stripe.InvoiceItemCreateParams>,
  ) => Promise<InvoiceItems>;
  finalizeInvoice: (invoiceId: Invoice['id']) => Promise<Invoice>;
}
