import { Chance } from 'chance';
import { Customer } from '../../src/infrastructure/domain/entities/customer';
import { Price, PriceAttributes, PriceInterval } from '../../src/infrastructure/domain/entities/price';
import { Subscription, SubscriptionAttributes } from '../../src/infrastructure/domain/entities/subscription';
import { PaymentMethod } from '../../src/infrastructure/domain/entities/paymentMethod';
import { Address } from '../../src/infrastructure/domain/types';
import { UserType } from '../../src/core/users/User';

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
    metadata: { cancellation_trial_redeemed: randomGenerator.bool().toString() },
    ...params,
  };

  return new Customer(attributes.id, attributes.name, attributes.email, attributes.address, attributes.phone);
};

export const getPriceEntity = (params?: Partial<PriceAttributes>): Price => {
  const amount = randomGenerator.integer({ min: 100, max: 100000 });

  return Price.toDomain({
    id: `price_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    productId: `prod_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    bytes: randomGenerator.integer({ min: 1, max: 10 }) * 1099511627776,
    interval: randomGenerator.pickone<PriceInterval>(['year', 'month', 'lifetime']),
    commitmentPlan: randomGenerator.bool(),
    recurring: randomGenerator.bool(),
    amount,
    currency: randomGenerator.pickone(['eur', 'usd']),
    decimalAmount: amount / 100,
    type: randomGenerator.pickone(Object.values(UserType)),
    ...params,
  });
};

export const getSubscriptionEntity = (params?: Partial<SubscriptionAttributes>): Subscription => {
  return Subscription.toDomain({
    id: `sub_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    customer: `cus_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    active: randomGenerator.bool(),
    metadata: {},
    created: randomGenerator.integer({ min: 1600000000, max: 1700000000 }),
    priceId: `price_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    currentPeriodEnd: randomGenerator.integer({ min: 1700000000, max: 1800000000 }),
    trialing: randomGenerator.bool(),
    trialEnd: randomGenerator.integer({ min: 1700000000, max: 1800000000 }),
    ...params,
  });
};

export const getPaymentMethodEntity = (params?: Partial<{ id: string; address: Address }>): PaymentMethod => {
  return new PaymentMethod(
    params?.id ?? `pm_${randomGenerator.string({ length: 14, alpha: true, numeric: true })}`,
    getAddress(params?.address),
  );
};
