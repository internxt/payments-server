import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../entities/customer';
import { PaymentMethod } from '../entities/paymentMethod';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<UpdateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
  retrievePaymentMethod: (paymentMethodId: PaymentMethod['id']) => Promise<PaymentMethod>;
}
