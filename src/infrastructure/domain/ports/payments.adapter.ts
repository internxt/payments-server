import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../entities/customer';
import { PaymentIntent } from '../entities/paymentIntent';
import { PaymentMethod } from '../entities/paymentMethod';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<UpdateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
  retrievePaymentMethod: (paymentMethodId: PaymentMethod['id']) => Promise<PaymentMethod>;
  getPaymentIntent: (paymentIntentId: string) => Promise<PaymentIntent>;
  cancelPaymentIntent: (paymentIntentId: string) => Promise<PaymentIntent>;
}
