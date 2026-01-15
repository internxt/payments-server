import { Customer, CreateCustomerParams } from '../entities/customer';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<CreateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
}
