import { Customer, CreateCustomerParams, UpdateCustomerParams } from '../entities/customer';
import { PaymentMethod } from '../entities/paymentMethod';
import { Price } from '../entities/price';

export interface PaymentsAdapter {
  createCustomer: (params: CreateCustomerParams) => Promise<Customer>;
  updateCustomer: (customerId: Customer['id'], params: Partial<UpdateCustomerParams>) => Promise<Customer>;
  getCustomer: (customerId: Customer['id']) => Promise<Customer>;
  searchCustomer: (email: Customer['email']) => Promise<Customer[]>;
  retrievePaymentMethod: (paymentMethodId: PaymentMethod['id']) => Promise<PaymentMethod>;
  getPriceById: (priceId: Price['id'], currency: string) => Promise<Price>;
  getPrices: (currency: string) => Promise<Price[]>;
}
