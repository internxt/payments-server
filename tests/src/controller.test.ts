import Stripe from 'stripe';
import { buildApp } from '../../src/app';
import { AppConfig } from '../../src/config';
import { UserSubscription } from '../../src/core/users/User';
import CacheService from '../../src/services/CacheService';
import { PaymentService } from '../../src/services/PaymentService';
import { StorageService } from '../../src/services/StorageService';
import { UserNotFoundError, UsersService } from '../../src/services/UsersService';

async function getMocks() {
  const paymentsService = {} as PaymentService;
  const storageService = {} as StorageService;
  const usersService = {} as UsersService;
  const cacheService = {} as CacheService;
  const stripe = {} as Stripe;
  const config = {
    JWT_SECRET: '63STAAE5LJ72NHAZ',
  } as AppConfig;
  const app = await buildApp(paymentsService, storageService, usersService, cacheService, stripe, config);

  return {
    paymentsService,
    storageService,
    usersService,
    cacheService,
    stripe,
    config,
    app,
    validToken:
      // eslint-disable-next-line max-len
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7InV1aWQiOiJiODQyODk3YS01MDg2LTQxODMtYWZiMS1mYTAwNGVlMzljNjYiLCJlbWFpbCI6InByZXBheW1lbnRzbGF1bmNoQGlueHQuY29tIiwibmFtZSI6ImhlbGxvIiwibGFzdG5hbWUiOiJoZWxsbyIsInVzZXJuYW1lIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJzaGFyZWRXb3Jrc3BhY2UiOnRydWUsIm5ldHdvcmtDcmVkZW50aWFscyI6eyJ1c2VyIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJwYXNzIjoiJDJhJDA4JFRRSmppNS9wUHpWUlp0UWNxOW9hd3VsdEFUYUlMTjdlUHNjWHg2Vy95WDhzNGJyM1FtOWJtIn19LCJpYXQiOjE2NTUxMDQwOTZ9.s3791sv4gmWgt5Ni1a8DnRw_5JyJ8g9Ff0bpIlqo6LM',
  };
}
describe('controller e2e tests', () => {
  describe('GET /invoices', () => {
    const testInvoices = [
      {
        id: 'in_1LA7lOFAOdcgaBMQmFJTnKZs',
        object: 'invoice',
        account_country: 'ES',
        account_name: 'Internxt Universal Technologies SL',
        account_tax_ids: null,
        amount_due: 99,
        amount_paid: 99,
        amount_remaining: 0,
        application: null,
        application_fee_amount: null,
        attempt_count: 1,
        attempted: true,
        auto_advance: false,
        automatic_tax: { enabled: false, status: null },
        billing_reason: 'subscription_create',
        charge: 'ch_3LA7lPFAOdcgaBMQ2jikcqfD',
        collection_method: 'charge_automatically',
        created: 1655105562,
        currency: 'eur',
        custom_fields: null,
        customer: 'cus_LrrUd9drntLhKG',
        customer_address: {
          city: 'Valencia',
          country: 'ES',
          line1: 'Calle de la salud 1, 1º',
          line2: null,
          postal_code: '46003',
          state: 'V',
        },
        customer_email: 'prepaymentslaunch@inxt.com',
        customer_name: 'Whatever Yes',
        customer_phone: null,
        customer_shipping: null,
        customer_tax_exempt: 'none',
        customer_tax_ids: [],
        default_payment_method: null,
        default_source: null,
        default_tax_rates: [],
        description: null,
        discount: null,
        discounts: [],
        due_date: null,
        ending_balance: 0,
        footer: null,
        hosted_invoice_url:
          // eslint-disable-next-line max-len
          'https://invoice.stripe.com/i/acct_1E1aqAFAOdcgaBMQ/test_YWNjdF8xRTFhcUFGQU9kY2dhQk1RLF9McnJVVzBnenRIWTJIR1lYRmowaWZFVkJNTWZvQnNNLDQ1NjUyMDk00200AqNH3KVe?s=ap',
        invoice_pdf:
          // eslint-disable-next-line max-len
          'https://pay.stripe.com/invoice/acct_1E1aqAFAOdcgaBMQ/test_YWNjdF8xRTFhcUFGQU9kY2dhQk1RLF9McnJVVzBnenRIWTJIR1lYRmowaWZFVkJNTWZvQnNNLDQ1NjUyMDk00200AqNH3KVe/pdf?s=ap',
        last_finalization_error: null,
        lines: {
          object: 'list',
          data: [
            {
              id: 'il_1LA7lOFAOdcgaBMQ6Lu7jouq',
              object: 'line_item',
              amount: 99,
              currency: 'eur',
              description: '1 × Drive 20GB (at €0.99 / month)',
              discount_amounts: [],
              discountable: true,
              discounts: [],
              livemode: false,
              metadata: {},
              period: { end: 1657697562, start: 1655105562 },
              plan: {
                id: 'plan_Gd66JNJCact3Ns',
                object: 'plan',
                active: true,
                aggregate_usage: null,
                amount: 99,
                amount_decimal: '99',
                billing_scheme: 'per_unit',
                created: 1580201915,
                currency: 'eur',
                interval: 'month',
                interval_count: 1,
                livemode: false,
                metadata: {
                  show: '1',
                  planType: 'subscription',
                  maxSpaceBytes: '21474836480',
                  name: 'drive_20gb_subscription_individual',
                },
                nickname: 'Monthly',
                product: 'prod_Gd64dtY4WJ22iu',
                tiers_mode: null,
                transform_usage: null,
                trial_period_days: 30,
                usage_type: 'licensed',
              },
              price: {
                id: 'plan_Gd66JNJCact3Ns',
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 1580201915,
                currency: 'eur',
                livemode: false,
                lookup_key: null,
                metadata: {
                  show: '1',
                  planType: 'subscription',
                  maxSpaceBytes: '21474836480',
                  name: 'drive_20gb_subscription_individual',
                },
                nickname: 'Monthly',
                product: 'prod_Gd64dtY4WJ22iu',
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  trial_period_days: 30,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 99,
                unit_amount_decimal: '99',
              },
              proration: false,
              proration_details: { credited_items: null },
              quantity: 1,
              subscription: 'sub_1LA7lOFAOdcgaBMQKMaH8OXH',
              subscription_item: 'si_LrrU7ijpMhGnSo',
              tax_amounts: [],
              tax_rates: [],
              type: 'subscription',
            },
          ],
          has_more: false,
          url: '/v1/invoices/in_1LA7lOFAOdcgaBMQmFJTnKZs/lines',
        },
        livemode: false,
        metadata: {},
        next_payment_attempt: null,
        number: 'S2020-1742',
        on_behalf_of: null,
        paid: true,
        paid_out_of_band: false,
        payment_intent: 'pi_3LA7lPFAOdcgaBMQ2GKyXKpe',
        payment_settings: { payment_method_options: null, payment_method_types: null },
        period_end: 1655105562,
        period_start: 1655105562,
        post_payment_credit_notes_amount: 0,
        pre_payment_credit_notes_amount: 0,
        quote: null,
        receipt_number: null,
        starting_balance: 0,
        statement_descriptor: null,
        status: 'paid',
        status_transitions: {
          finalized_at: 1655105562,
          marked_uncollectible_at: null,
          paid_at: 1655105565,
          voided_at: null,
        },
        subscription: 'sub_1LA7lOFAOdcgaBMQKMaH8OXH',
        subtotal: 99,
        tax: null,
        test_clock: null,
        total: 99,
        total_discount_amounts: [],
        total_tax_amounts: [],
        transfer_data: null,
        webhooks_delivered_at: 1655105568,
      },
    ] as Stripe.Invoice[];

    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({ path: '/invoices', headers: { authorization: 'Bearer faketoken' } });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 404 if the authenticated user is not found', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };
      const response = await app.inject({ path: '/invoices', headers: { authorization: `Bearer ${validToken}` } });
      expect(response.statusCode).toBe(404);
    });

    test('happy path', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();
      usersService.findUserByUuid = async () => {
        return { customerId: 'customerId', uuid: 'uuid' };
      };
      paymentsService.getInvoicesFromUser = async () => testInvoices;

      const response = await app.inject({
        path: '/invoices',
        headers: { authorization: `Bearer ${validToken}` },
        query: { limit: '15', starting_after: 'starting_after_id' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);

      const invoice = testInvoices[0];

      const expectedInvoice = {
        id: invoice.id,
        created: invoice.created,
        pdf: invoice.invoice_pdf,
        bytesInPlan: invoice.lines.data[0].price!.metadata.maxSpaceBytes,
      };

      expect([expectedInvoice]).toMatchObject(body);
    });
  });

  describe('PUT /subscriptions', () => {
    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({
        method: 'PUT',
        path: '/subscriptions',
        headers: { authorization: 'Bearer faketoken' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 404 if the authenticated user is not found', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };
      const response = await app.inject({
        method: 'PUT',
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ price_id: 'price_id' }),
      });
      expect(response.statusCode).toBe(404);
    });

    test('it should return 400 if the body is not in the expected format', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };
      const response = await app.inject({
        method: 'PUT',
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ priceId: 'price_id' }),
      });
      expect(response.statusCode).toBe(400);
    });

    test('happy path', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      paymentsService.updateSubscriptionPrice = async () => {
        return {} as Stripe.Subscription;
      };

      paymentsService.getUserSubscription = async (customerId: string) => {
        return Promise.resolve({} as UserSubscription);
      };

      const fn = jest.spyOn(paymentsService, 'updateSubscriptionPrice');
      const getUserSubscriptionSpy = jest.spyOn(paymentsService, 'getUserSubscription');

      const response = await app.inject({
        method: 'PUT',
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ price_id: 'price_id' }),
      });

      expect(fn).toBeCalledWith('customerId', 'price_id');
      expect(getUserSubscriptionSpy).toBeCalledWith('customerId');

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /setup-intent', () => {
    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({
        path: '/setup-intent',
        headers: { authorization: 'Bearer faketoken' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 404 if the authenticated user is not found', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };
      const response = await app.inject({
        path: '/setup-intent',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    test('happy path', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      paymentsService.getSetupIntent = async () => {
        return { client_secret: 'clientSecret' } as Stripe.SetupIntent;
      };

      const fn = jest.spyOn(paymentsService, 'getSetupIntent');

      const response = await app.inject({
        path: '/setup-intent',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(fn).toBeCalledWith('customerId');

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ clientSecret: 'clientSecret' });
    });
  });

  describe('GET /default-payment-method', () => {
    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({
        path: '/default-payment-method',
        headers: { authorization: 'Bearer faketoken' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 404 if the authenticated user is not found', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };
      const response = await app.inject({
        path: '/default-payment-method',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    test('happy path', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      paymentsService.getDefaultPaymentMethod = async () => {
        return {} as Stripe.Card;
      };

      const fn = jest.spyOn(paymentsService, 'getDefaultPaymentMethod');

      const response = await app.inject({
        path: '/default-payment-method',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(fn).toBeCalledWith('customerId');

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /subscriptions', () => {
    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({
        path: '/subscriptions',
        headers: { authorization: 'Bearer faketoken' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 404 if the authenticated user is not found', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };
      const response = await app.inject({
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    test('happy path with cache hit', async () => {
      const { app, usersService, validToken, cacheService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      cacheService.getSubscription = async () => {
        return { type: 'lifetime' };
      };

      const fn = jest.spyOn(cacheService, 'getSubscription');

      const response = await app.inject({
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(fn).toBeCalledWith('customerId');

      expect(response.statusCode).toBe(200);

      expect(JSON.parse(response.body)).toMatchObject({ type: 'lifetime' });
    });

    test('happy path with cache miss', async () => {
      const { app, usersService, validToken, cacheService, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      cacheService.getSubscription = async () => {
        return null;
      };

      paymentsService.getUserSubscription = async () => {
        return { type: 'lifetime' };
      };

      cacheService.setSubscription = async () => undefined;

      const cacheGetFn = jest.spyOn(cacheService, 'getSubscription');
      const cacheSetFn = jest.spyOn(cacheService, 'setSubscription');
      const serviceFn = jest.spyOn(paymentsService, 'getUserSubscription');

      const response = await app.inject({
        path: '/subscriptions',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(cacheGetFn).toBeCalledWith('customerId');
      expect(cacheSetFn).toBeCalledWith('customerId', { type: 'lifetime' });
      expect(serviceFn).toBeCalledWith('customerId');

      expect(response.statusCode).toBe(200);

      expect(JSON.parse(response.body)).toMatchObject({ type: 'lifetime' });
    });
  });

  describe('GET /prices', () => {
    it('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({ path: '/prices', headers: { authorization: 'Bearer faketoken' } });
      expect(response.statusCode).toBe(401);
    });
    it('happy path', async () => {
      const { app, paymentsService, validToken } = await getMocks();
      paymentsService.getPrices = async () => {
        return [{ amount: 49, bytes: 20, id: 'price', interval: 'month', currency: '€' }];
      };
      const response = await app.inject({ path: '/prices', headers: { authorization: `Bearer ${validToken}` } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject(await paymentsService.getPrices());
    });
  });

  describe('POST /checkout-session', () => {
    test('it should return 401 if no valid token is present in the request', async () => {
      const { app } = await getMocks();
      const response = await app.inject({
        method: 'POST',
        path: '/checkout-session',
        headers: { authorization: 'Bearer faketoken' },
      });
      expect(response.statusCode).toBe(401);
    });

    test('it should return 400 if the body is not in the expected format', async () => {
      const { app, usersService, validToken } = await getMocks();
      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };
      const response = await app.inject({
        method: 'POST',
        path: '/checkout-session',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ priceId: 'price_id', successUrl: 'success_url', cancelUrl: 'cancel_url' }),
      });
      expect(response.statusCode).toBe(400);
    });

    test('happy path when user is found in db', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        return { uuid: 'uuid', customerId: 'customerId' };
      };

      paymentsService.getCheckoutSession = async () => {
        return { id: 'sessionId' } as Stripe.Checkout.Session;
      };

      const fn = jest.spyOn(paymentsService, 'getCheckoutSession');

      const response = await app.inject({
        method: 'POST',
        path: '/checkout-session',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({
          price_id: 'price_id',
          success_url: 'success_url',
          cancel_url: 'cancel_url',
          customer_email: 'acustomeremail@inxt.com',
        }),
      });

      expect(fn).toBeCalledWith('price_id', 'success_url', 'cancel_url', await usersService.findUserByUuid('uuid'));

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ sessionId: 'sessionId' });
    });

    test('happy path when user is not found in db', async () => {
      const { app, usersService, validToken, paymentsService } = await getMocks();

      usersService.findUserByUuid = async () => {
        throw new UserNotFoundError();
      };

      paymentsService.getCheckoutSession = async () => {
        return { id: 'sessionId' } as Stripe.Checkout.Session;
      };

      const fn = jest.spyOn(paymentsService, 'getCheckoutSession');

      const response = await app.inject({
        method: 'POST',
        path: '/checkout-session',
        headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({
          price_id: 'price_id',
          success_url: 'success_url',
          cancel_url: 'cancel_url',
          customer_email: 'acustomeremail@inxt.com',
        }),
      });

      expect(fn).toBeCalledWith('price_id', 'success_url', 'cancel_url', 'acustomeremail@inxt.com');

      expect(response.statusCode).toBe(200);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ sessionId: 'sessionId' });
    });
  });
});
