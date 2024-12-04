import jwt from 'jsonwebtoken';
import envVarsConfig from '../../../src/config';
import { randomUUID } from 'crypto';
import { User } from '../../../src/core/users/User';
import { FastifyBaseLogger } from 'fastify';
import { Chance } from 'chance';

const randomDataGenerator = new Chance();

export default function getMocks() {
  const uniqueCode = {
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

  const preventCancellationTestUsers = {
    nonElegible: {
      lifetimeUserUuid: 'ee4f8abf-397c-4558-b794-a675a4bed2d7',
      subscriptionUserUuid: '48cef034-011b-4e75-9671-86928a2370e7',
    },
    elegible: {
      subscriptionUserUuid: '223b88d7-f5a0-4592-a76c-22758c074757',
    },
  };

  const prices = {
    subscription: {
      exists: 'price_1PLMh8FAOdcgaBMQlZcGAPY4',
      doesNotExist: 'price_1PLMerFAOdcgaBMQ17q27Cas',
    },
    lifetime: {
      exists: 'price_1PLMTpFAOdcgaBMQ0Jag685H',
      doesNotExist: 'price_1PLMVCFAOdcgaBMQxIQgdXsds',
    },
  };

  const mockPromotionCodeResponse = {
    codeId: 'promo_id',
    promoCodeName: 'PROMO_NAME',
    amountOff: null,
    discountOff: 75,
  };
  const mockCreateSubscriptionResponse = {
    type: 'payment',
    clientSecret: 'client_secret',
  };
  const paymentIntentResponse = {
    clientSecret: 'client_secret',
  };

  const mockedCoupon = {
    id: randomUUID(),
    provider: 'stripe',
    code: 'c0UP0n',
  };

  const couponName = {
    invalid: 'INVALID_COUPON',
    valid: 'PROMOCODE',
  };

  const mockedUserWithLifetime: User = {
    id: randomUUID(),
    uuid: randomUUID(),
    customerId: `cus_${randomUUID()}`,
    lifetime: true,
  };

  const mockedUserWithoutLifetime: User = {
    id: randomUUID(),
    uuid: randomUUID(),
    customerId: `cus_${randomUUID()}`,
    lifetime: false,
  };

  const mockedCustomerPayload = {
    email: 'test@example.com',
    name: 'Test User',
  };

  const createdSubscriptionPayload = {
    customerId: 'cId',
    amount: 100,
    priceId: 'price_id',
    promotion_code: 'promo_code',
  };

  const mockActiveSubscriptions = [
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

  const mockCharge = {
    id: `ch_${randomUUID()}`,
    customer: `cus_${randomUUID()}`,
    invoice: `in_${randomUUID()}`,
    amount: randomDataGenerator.integer({ min: 500, max: 5000 }),
    currency: 'usd',
    status: 'succeeded',
  };

  const mockDispute = {
    id: `dp_${randomUUID()}`,
    status: 'lost',
    charge: mockCharge.id,
    amount: mockCharge.amount,
    currency: mockCharge.currency,
  };

  const mockInvoice = {
    id: `in_${randomUUID()}`,
    subscription: `sub_${randomUUID()}`,
  };

  const mockLogger: jest.Mocked<FastifyBaseLogger> = {
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

  function getValidToken(userUuid: string): string {
    return jwt.sign({ payload: { uuid: userUuid } }, envVarsConfig.JWT_SECRET);
  }

  return {
    getValidToken,
    preventCancellationTestUsers,
    uniqueCode,
    mockedCoupon,
    mockedUserWithLifetime,
    mockedUserWithoutLifetime,
    mockActiveSubscriptions,
    couponName,
    mockCharge,
    mockDispute,
    mockInvoice,
    mockLogger,
    mockedCustomerPayload,
    createdSubscriptionPayload,
    paymentIntentResponse,
    mockCreateSubscriptionResponse,
    mockPromotionCodeResponse,
    validToken:
      // eslint-disable-next-line max-len
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7InV1aWQiOiJiODQyODk3YS01MDg2LTQxODMtYWZiMS1mYTAwNGVlMzljNjYiLCJlbWFpbCI6InByZXBheW1lbnRzbGF1bmNoQGlueHQuY29tIiwibmFtZSI6ImhlbGxvIiwibGFzdG5hbWUiOiJoZWxsbyIsInVzZXJuYW1lIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJzaGFyZWRXb3Jrc3BhY2UiOnRydWUsIm5ldHdvcmtDcmVkZW50aWFscyI6eyJ1c2VyIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJwYXNzIjoiJDJhJDA4JFRRSmppNS9wUHpWUlp0UWNxOW9hd3VsdEFUYUlMTjdlUHNjWHg2Vy95WDhzNGJyM1FtOWJtIn19LCJpYXQiOjE2NTUxMDQwOTZ9.s3791sv4gmWgt5Ni1a8DnRw_5JyJ8g9Ff0bpIlqo6LM',
    prices,
  };
}
