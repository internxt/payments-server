import { Chance } from 'chance';
import { Address, Customer, PaymentMethod } from '../../src/types/customer';
import { Price, PriceAttributes } from '../../src/infrastructure/domain/entities/price';
import { Subscription, SubscriptionAttributes } from '../../src/infrastructure/domain/entities/subscription';
import { UserType } from '../../src/core/users/User';
import dayjs from 'dayjs';
import { Invoice, InvoiceStatus } from '../../src/infrastructure/domain/entities/invoice';
import { getInvoice, getInvoiceItems } from './fixtures';
import { InvoiceItems } from '../../src/infrastructure/domain/entities/invoiceItems';
import { PreCreatedUser, PreCreatedUserStatus } from '../../src/core/users/PreCreatedUser';

const randomGenerator = new Chance();

const getAddress = (params?: Partial<Address>): Address => ({
  line1: randomGenerator.address(),
  line2: randomGenerator.address(),
  city: randomGenerator.city(),
  state: randomGenerator.state(),
  country: randomGenerator.country(),
  postalCode: randomGenerator.zip(),
  ...params,
});

interface CustomerEntityParams {
  id: string;
  name: string;
  email: string;
  address: Address;
  phone: string;
  metadata: Record<string, string>;
}

export const getCustomerEntity = (params?: Partial<CustomerEntityParams>): Customer => {
  const attributes: CustomerEntityParams = {
    id: `cus_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    name: randomGenerator.name(),
    email: randomGenerator.email(),
    address: getAddress(),
    phone: randomGenerator.phone(),
    metadata: {},
    ...params,
  };

  return attributes;
};

export const getPriceEntity = (params?: Partial<PriceAttributes>): Price => {
  const amount = randomGenerator.integer({ min: 100, max: 100000 });

  return Price.toDomain({
    id: `price_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    productId: `prod_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    bytes: randomGenerator.integer({ min: 1, max: 10 }) * 1099511627776,
    interval: 'year',
    commitmentPlan: false,
    recurring: true,
    amount,
    currency: randomGenerator.pickone(['eur', 'usd']),
    decimalAmount: amount / 100,
    type: UserType.Individual,
    ...params,
  });
};

export const getSubscriptionEntity = (params?: Partial<SubscriptionAttributes>): Subscription => {
  return Subscription.toDomain({
    id: `sub_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    customer: `cus_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    metadata: {},
    startDate: dayjs().unix(),
    priceId: `price_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    currentPeriodEnd: dayjs().add(1, 'month').unix(),
    status: randomGenerator.pickone(['active', 'trialing', 'past_due', 'canceled']),
    trialEnd: randomGenerator.integer({ min: 1700000000, max: 1800000000 }),
    ...params,
  });
};

export const getPaymentMethodEntity = (params?: Partial<{ id: string; address: Address }>): PaymentMethod => {
  return {
    id: params?.id ?? `pm_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    address: getAddress(params?.address),
  };
};

export const getInvoiceEntity = (params?: Partial<Invoice>): Invoice => {
  const mockedInvoice = getInvoice();
  return Invoice.toDomain({
    id: mockedInvoice.id as string,
    clientSecretId: mockedInvoice.confirmation_secret?.client_secret,
    status: mockedInvoice.status as InvoiceStatus,
    ...params,
  });
};

export const getInvoiceItemsEntity = (params?: Partial<InvoiceItems>): Invoice => {
  const mockedInvoiceItem = getInvoiceItems();
  return InvoiceItems.toDomain({
    id: mockedInvoiceItem.id,
    ...params,
  });
};

export const getPreCreatedUser = (params?: Partial<PreCreatedUser>): PreCreatedUser => ({
  uuid: randomGenerator.guid(),
  status: PreCreatedUserStatus.AwaitingPayment,
  ...params,
});
