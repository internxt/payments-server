import { randomUUID } from 'crypto';
import { User } from '../../../src/core/users/User';

export const mockedCoupon = {
  id: randomUUID(),
  provider: 'stripe',
  code: 'c0UP0n',
};

export const mockedUser: User = {
  id: randomUUID(),
  uuid: randomUUID(),
  customerId: randomUUID(),
  lifetime: false,
};

export const mockActiveSubscriptions = [
  {
    id: 'sub_1ExampleBusiness',
    object: 'subscription',
    customer: 'cus_123456789',
    status: 'active',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_12345',
          object: 'subscription_item',
          price: {
            id: 'price_1ExampleBusiness',
            object: 'price',
            currency: 'usd',
            unit_amount: 5000,
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
            product: {
              id: 'prod_1ExampleBusiness',
              object: 'product',
              active: true,
              metadata: {
                type: 'business',
              },
              name: 'Business Product',
            },
          },
          quantity: 5, // Business subscription with 5 seats
        },
      ],
    },
    product: {
      id: 'prod_1ExampleBusiness',
      object: 'product',
      active: true,
      metadata: {
        type: 'business',
      },
      name: 'Business Product',
    },
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days from now
    current_period_start: Math.floor(Date.now() / 1000), // Now
  },
  {
    id: 'sub_1ExampleEmpty',
    object: 'subscription',
    customer: 'cus_987654321',
    status: 'active',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_67890',
          object: 'subscription_item',
          price: {
            id: 'price_1ExampleEmpty',
            object: 'price',
            currency: 'usd',
            unit_amount: 1000,
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
            product: {
              id: 'prod_1ExampleEmpty',
              object: 'product',
              active: true,
              metadata: {}, // Empty metadata
              name: 'Empty Metadata Product',
            },
          },
          quantity: 1, // Default quantity for individual
        },
      ],
    },
    product: {
      id: 'prod_1ExampleEmpty',
      object: 'product',
      active: true,
      metadata: {}, // Empty metadata
      name: 'Empty Metadata Product',
    },
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days from now
    current_period_start: Math.floor(Date.now() / 1000), // Now
  },
];
