import config from '../../src/config';
import {
  getUser,
  getValidToken,
  getActiveSubscriptions,
  getCharge,
  getCoupon,
  getCreatedSubscription,
  getCreateSubscriptionResponse,
  getCustomer,
  getDispute,
  getInvoice,
  getInvoices,
  getLogger,
  getPaymentIntentResponse,
  getPrices,
  getPromotionCode,
  newTier,
  getUniqueCodes,
} from './fixtures';
import jwt from 'jsonwebtoken';

describe('Test fixtures', () => {
  describe("User's fixture", () => {
    describe('Generating a user', () => {
      it('When generating a user, then the UUID should be unique', () => {
        const user1 = getUser();
        const user2 = getUser();

        expect(user1.uuid).toBeDefined();
        expect(user1.uuid).not.toBe(user2.uuid);
      });

      it('When generating a user, then the customerId should be unique', () => {
        const user1 = getUser();
        const user2 = getUser();

        expect(user1.customerId).toBeDefined();
        expect(user1.customerId).not.toBe(user2.customerId);
      });

      it('When generating a user without specifying lifetime, then lifetime should be false', () => {
        const user = getUser();
        expect(user.lifetime).toBe(false);
      });

      it('When generating a user with lifetime set to true, then lifetime should be true', () => {
        const user = getUser({ lifetime: true });
        expect(user.lifetime).toBe(true);
      });

      it('When generating a user with custom parameters, then it should use the provided values', () => {
        const customUser = {
          id: 'customer-id',
          uuid: 'customer-uuid',
          customerId: 'cus_custom123',
          lifetime: true,
        };

        const user = getUser(customUser);

        expect(user.id).toBe(customUser.id);
        expect(user.uuid).toBe(customUser.uuid);
        expect(user.customerId).toBe(customUser.customerId);
        expect(user.lifetime).toBe(customUser.lifetime);
      });
    });

    describe('Ensuring uniqueness', () => {
      it('When generating multiple users, then they should all have different UUIDs and customer IDs', () => {
        const users = Array.from({ length: 5 }, () => getUser());

        const uuids = users.map((user) => user.uuid);
        const customerIds = users.map((user) => user.customerId);

        expect(new Set(uuids).size).toBe(users.length);
        expect(new Set(customerIds).size).toBe(users.length);
      });
    });
  });

  describe("Token's fixtures", () => {
    it('When generating a token, then it should be a valid JWT', () => {
      const uuid = '223b88d7-f5a0-4592-a76c-22758c074757';
      const token = getValidToken(uuid);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, config.JWT_SECRET) as any;
      expect(decoded.payload.uuid).toBe(uuid);
    });
  });

  describe('Customers fixture', () => {
    it('When generating a customer payload, then it should have default values', () => {
      const customer = getCustomer();

      expect(customer.id).toMatch(/^cus_/);
      expect(customer.email).toBe('example@internxt.com');
      expect(customer.name).toBe('My internxt');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const customer = getCustomer({ email: 'custom@example.com', name: 'Custom Name' });

      expect(customer.email).toBe('custom@example.com');
      expect(customer.name).toBe('Custom Name');
    });
  });

  describe('Promotion code fixture', () => {
    it('When generating a promotion code, then it should have default values', () => {
      const promoCode = getPromotionCode({});

      expect(promoCode.codeId).toBe('promo_id');
      expect(promoCode.percentOff).toBe(75);
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const promoCode = getPromotionCode({ percentOff: 50 });

      expect(promoCode.percentOff).toBe(50);
    });
  });

  describe("Price's fixture", () => {
    it('When generating prices, then it should return predefined price IDs', () => {
      const prices = getPrices();

      expect(prices.subscription.exists).toBe('price_1Qtm4MFAOdcgaBMQ0cUPiqRA');
      expect(prices.lifetime.doesNotExist).toBe('price_1PLMVCFAOdcgaBMQxIQgdXsds');
    });
  });

  describe("Subscription's fixture", () => {
    describe('Created Subscription response', () => {
      it('When generating a subscription response, then it should have a default clientSecret', () => {
        const response = getCreateSubscriptionResponse();

        expect(response.type).toBe('payment');
        expect(response.clientSecret).toBeDefined();
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const response = getCreateSubscriptionResponse({ type: 'setup' });

        expect(response.type).toBe('setup');
      });
    });

    describe('Created subscription object', () => {
      it('When generating a subscription, then it should have default values', () => {
        const subscription = getCreatedSubscription();

        expect(subscription.id).toMatch(/^sub_/);
        expect(subscription.status).toBe('active');
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const subscription = getCreatedSubscription({ status: 'canceled' });

        expect(subscription.status).toBe('canceled');
      });
    });

    describe('Active subscriptions', () => {
      it('When generating active subscriptions, then it should return the specified number of subscriptions', () => {
        const subscriptions = getActiveSubscriptions(2, [{ id: 'sub_123' }, { id: 'sub_456' }]);

        expect(subscriptions).toHaveLength(2);
        expect(subscriptions[0].id).toBe('sub_123');
        expect(subscriptions[1].id).toBe('sub_456');
      });
    });
  });

  describe('Payment intent fixture', () => {
    it('When generating a payment intent, then it should have a client secret', () => {
      const intent = getPaymentIntentResponse();

      expect(intent.clientSecret).toBe('client_secret');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const intent = getPaymentIntentResponse({ invoiceStatus: 'paid' });

      expect(intent.invoiceStatus).toBe('paid');
    });
  });

  describe('Coupon fixture', () => {
    it('When generating a coupon, then it should have a default code', () => {
      const coupon = getCoupon();

      expect(coupon.code).toBe('c0UP0n');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const coupon = getCoupon({ code: 'NEWCODE' });

      expect(coupon.code).toBe('NEWCODE');
    });
  });

  describe('Tier fixture', () => {
    it('When generating a new tier, then it should have default values', () => {
      const tier = newTier();

      expect(tier.billingType).toBe('subscription');
      expect(tier.label).toBe('test-label');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const tier = newTier({ label: 'Custom Label' });

      expect(tier.label).toBe('Custom Label');
    });
  });

  describe('Logger fixture', () => {
    it('When generating a logger, then all functions should be mocked', () => {
      const logger = getLogger();

      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe('function');

      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe('function');

      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe('function');

      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');

      expect(logger.fatal).toBeDefined();
      expect(typeof logger.fatal).toBe('function');

      expect(logger.trace).toBeDefined();
      expect(typeof logger.trace).toBe('function');

      expect(logger.silent).toBeDefined();
      expect(typeof logger.silent).toBe('function');
    });
  });

  describe('Invoice fixtures', () => {
    describe('Invoice object', () => {
      it('When generating an invoice, then it should have default values', () => {
        const invoice = getInvoice();

        expect(invoice).toBeDefined();
        expect(invoice.id).toMatch(/^in_/);
        expect(invoice.object).toBe('invoice');
        expect(invoice.account_country).toBe('US');
        expect(invoice.customer_email).toBe('example@internxt.com');
        expect(invoice.status).toBe('draft');
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const invoice = getInvoice({ status: 'paid', account_country: 'CA' });

        expect(invoice.status).toBe('paid');
        expect(invoice.account_country).toBe('CA');
      });
    });

    describe('Invoices array object', () => {
      it('When generating multiple invoices, then it should return the specified number of invoices', () => {
        const invoices = getInvoices(3);

        expect(invoices).toHaveLength(3);
        invoices.forEach((invoice) => {
          expect(invoice).toBeDefined();
          expect(invoice.id).toMatch(/^in_/);
        });
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const invoices = getInvoices(2, [
          { id: 'in_custom1', status: 'paid' },
          { id: 'in_custom2', status: 'void' },
        ]);

        expect(invoices[0].id).toBe('in_custom1');
        expect(invoices[0].status).toBe('paid');

        expect(invoices[1].id).toBe('in_custom2');
        expect(invoices[1].status).toBe('void');
      });
    });
  });

  describe('Unique code fixture', () => {
    it('When generating a unique code, then it should return predefined values', () => {
      const codes = getUniqueCodes();

      expect(codes.techCult.codes.elegible).toBe('5tb_redeem_code');
      expect(codes.techCult.codes.nonElegible).toBe('2tb_code_redeem');
      expect(codes.techCult.codes.doesntExist).toBe('doesnt_exist');
      expect(codes.techCult.provider).toBe('TECHCULT');
    });
  });

  describe('Charge fixture', () => {
    it('When generating a charge, then it should have default values', () => {
      const charge = getCharge();

      expect(charge).toBeDefined();
      expect(charge.id).toMatch(/^ch_/);
      expect(charge.amount).toBe(1099);
      expect(charge.currency).toBe('usd');
      expect(charge.status).toBe('succeeded');
      expect(charge.paid).toBe(true);
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const charge = getCharge({ amount: 5000, status: 'failed' });

      expect(charge.amount).toBe(5000);
      expect(charge.status).toBe('failed');
    });
  });

  describe('Dispute fixture', () => {
    it('When generating a dispute, then it should have default values', () => {
      const dispute = getDispute();

      expect(dispute).toBeDefined();
      expect(dispute.id).toMatch(/^du_/);
      expect(dispute.amount).toBe(1000);
      expect(dispute.currency).toBe('usd');
      expect(dispute.status).toBe('lost');
      expect(dispute.reason).toBe('general');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const dispute = getDispute({ amount: 2000, status: 'won' });

      expect(dispute.amount).toBe(2000);
      expect(dispute.status).toBe('won');
    });
  });
});
