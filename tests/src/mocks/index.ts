import jwt from 'jsonwebtoken';
import envVarsConfig from '../../../src/config';
import { randomUUID } from 'crypto';
import { User } from '../../../src/core/users/User';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';
import { Tier } from '../../../src/core/users/MongoDBTiersRepository';

const randomDataGenerator = new Chance();

export function user() {
  return {
    customerId: 'cus_RbPFdWW7LCxL2c',
    uuid: '223b88d7-f5a0-4592-a76c-22758c074757',
    lifetime: false,
  };
}

export function mockedUserWithoutLifetime(): User {
  return {
    id: randomUUID(),
    uuid: randomUUID(),
    customerId: `cus_${randomUUID()}`,
    lifetime: false,
  };
}

export function mockedCustomerPayload() {
  return {
    email: 'test@example.com',
    name: 'Test User',
  };
}

export function mockPromotionCodeResponse() {
  return {
    codeId: 'promo_id',
    promoCodeName: 'PROMO_NAME',
    amountOff: null,
    discountOff: 75,
  };
}

export function prices() {
  return {
    subscription: {
      exists: 'price_1PLMh8FAOdcgaBMQlZcGAPY4',
      doesNotExist: 'price_1PLMerFAOdcgaBMQ17q27Cas',
    },
    lifetime: {
      exists: 'price_1PLMTpFAOdcgaBMQ0Jag685H',
      doesNotExist: 'price_1PLMVCFAOdcgaBMQxIQgdXsds',
    },
  };
}

export function couponName() {
  return {
    invalid: 'INVALID_COUPON',
    valid: 'PROMOCODE',
  };
}

export function mockCreateSubscriptionResponse() {
  return {
    type: 'payment',
    clientSecret: 'client_secret',
  };
}

export function createdSubscriptionPayload() {
  return {
    customerId: 'cId',
    amount: 100,
    priceId: 'price_id',
    promotion_code: 'promo_code',
  };
}

export function paymentIntentResponse() {
  return {
    clientSecret: 'client_secret',
  };
}

export const mockActiveSubscriptions = () => [
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

export const mockedCoupon = () => ({
  id: randomUUID(),
  provider: 'stripe',
  code: 'c0UP0n',
});

export function getValidToken(userUuid: string): string {
  return jwt.sign({ payload: { uuid: userUuid } }, envVarsConfig.JWT_SECRET);
}

export function newTier(params?: Partial<Tier>): Tier {
  return {
    billingType: 'subscription',
    label: 'test-label',
    productId: randomDataGenerator.string({
      length: 15,
    }),
    featuresPerService: {
      mail: {
        enabled: false,
        addressesPerUser: randomDataGenerator.integer({
          min: 0,
          max: 5,
        }),
      },
      meet: {
        enabled: false,
        paxPerCall: randomDataGenerator.integer({
          min: 0,
          max: 5,
        }),
      },
      vpn: {
        enabled: false,
        locationsAvailable: randomDataGenerator.integer({
          min: 0,
          max: 5,
        }),
      },
      antivirus: {
        enabled: false,
      },
      backups: {
        enabled: false,
      },
      drive: {
        enabled: false,
        maxSpaceBytes: randomDataGenerator.integer({
          max: 5 * 1024 * 1024 * 1024,
          min: 1024 * 1024 * 1024,
        }),
        workspaces: {
          enabled: false,
          maximumSeats: randomDataGenerator.integer({
            max: 100,
            min: 10,
          }),
          minimumSeats: randomDataGenerator.integer({
            min: 3,
            max: 3,
          }),
          maxSpaceBytesPerSeat: randomDataGenerator.integer({
            max: 5 * 1024 * 1024 * 1024,
            min: 1024 * 1024 * 1024,
          }),
        },
      },
    },
    ...params,
  };
}

export function mockLogger(): jest.Mocked<FastifyBaseLogger> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    level: 'info',
    silent: jest.fn(),
    child: jest.fn(),
  };
}

export function mockInvoices() {
  return [
    {
      id: `in_${randomUUID()}`,
      created: 1640995200,
      invoice_pdf: 'https://example.com/inv_1.pdf',
      lines: {
        data: [
          {
            price: {
              metadata: {
                maxSpaceBytes: '1073741824',
                type: 'individual',
              },
            },
          },
        ],
      },
      total: 1000,
      currency: 'usd',
      subscription: `sub_${randomUUID()}`,
    },
    {
      id: `in_${randomUUID()}`,
      created: 1640995300,
      invoice_pdf: 'https://example.com/inv_2.pdf',
      lines: {
        data: [
          {
            price: {
              metadata: {
                maxSpaceBytes: '2147483648',
                type: 'business',
              },
            },
          },
        ],
      },
      total: 2000,
      currency: 'usd',
      subscription: `sub_${randomUUID()}`,
    },
  ];
}

export function uniqueCode() {
  return {
    techCult: {
      codes: {
        elegible: '5tb_redeem_code', //REDEEMED: FALSE
        nonElegible: '2tb_code_redeem', //REDEEMED: TRUE
        doesntExist: 'doesnt_exist',
      },
      provider: 'TECHCULT',
    },
    stackCommerce: {
      codes: {
        elegible: '5tb_redeem_code', //REDEEMED: FALSE
        nonElegible: '2tb_code_redeem', //REDEEMED: TRUE
        doesntExist: 'doesnt_exist',
      },
      provider: 'STACKCOMMERCE',
    },
  };
}

export function preventCancellationTestUsers() {
  return {
    nonElegible: {
      lifetimeUserUuid: 'ee4f8abf-397c-4558-b794-a675a4bed2d7',
      subscriptionUserUuid: '48cef034-011b-4e75-9671-86928a2370e7',
    },
    elegible: {
      subscriptionUserUuid: '223b88d7-f5a0-4592-a76c-22758c074757',
    },
  };
}

export function mockedUserWithLifetime(): User {
  return {
    id: randomUUID(),
    uuid: randomUUID(),
    customerId: `cus_${randomUUID()}`,
    lifetime: true,
  };
}

export function mockCharge() {
  return {
    id: `ch_${randomDataGenerator.string({
      length: 8,
    })}`,
    customer: `cus_${randomDataGenerator.string({
      length: 8,
    })}`,
    invoice: `in_${randomDataGenerator.string({
      length: 8,
    })}`,
    amount: randomDataGenerator.integer({ min: 500, max: 5000 }),
    currency: 'usd',
    status: 'succeeded',
  };
}

export function mockDispute(mockedCharge: {
  id: string;
  customer: string;
  invoice: string;
  amount: number;
  currency: string;
  status: string;
}) {
  return {
    id: `dp_${randomDataGenerator.string({
      length: 8,
    })}`,
    status: 'lost',
    charge: mockedCharge.id,
    amount: mockedCharge.amount,
    currency: mockedCharge.currency,
  };
}

export const voidPromise = () => Promise.resolve();
