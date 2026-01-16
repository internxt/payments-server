import { Customer, CreateCustomerParams } from '../entities/customer';
import { PaymentMethod } from '../entities/paymentMethod';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<CreateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
  retrievePaymentMethod: (paymentMethodId: PaymentMethod['id']) => Promise<PaymentMethod>;
}
