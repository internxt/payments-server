import config from '../../src/config';
import {
  createdSubscription,
  getUser,
  getValidToken,
  mockActiveSubscriptions,
  mockCreateSubscriptionResponse,
  mockCustomerPayload,
  mockPrices,
  mockPromotionCode,
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
      const customer = mockCustomerPayload();

      expect(customer.id).toMatch(/^cus_/);
      expect(customer.email).toBe('example@internxt.com');
      expect(customer.name).toBe('My internxt');
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const customer = mockCustomerPayload({ email: 'custom@example.com', name: 'Custom Name' });

      expect(customer.email).toBe('custom@example.com');
      expect(customer.name).toBe('Custom Name');
    });
  });

  describe('Promotion code fixture', () => {
    it('When generating a promotion code, then it should have default values', () => {
      const promoCode = mockPromotionCode({});

      expect(promoCode.codeId).toBe('promo_id');
      expect(promoCode.percentOff).toBe(75);
    });

    it('When passing custom parameters, then it should override the defaults', () => {
      const promoCode = mockPromotionCode({ percentOff: 50 });

      expect(promoCode.percentOff).toBe(50);
    });
  });

  describe("Price's fixture", () => {
    it('When generating prices, then it should return predefined price IDs', () => {
      const prices = mockPrices();

      expect(prices.subscription.exists).toBe('price_1PLMh8FAOdcgaBMQlZcGAPY4');
      expect(prices.lifetime.doesNotExist).toBe('price_1PLMVCFAOdcgaBMQxIQgdXsds');
    });
  });

  describe("Subscription's fixture", () => {
    describe('Created Subscription response', () => {
      it('When generating a subscription response, then it should have a default clientSecret', () => {
        const response = mockCreateSubscriptionResponse();

        expect(response.type).toBe('payment');
        expect(response.clientSecret).toBeDefined();
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const response = mockCreateSubscriptionResponse({ clientSecret: 'custom_secret' });

        expect(response.clientSecret).toBe('custom_secret');
      });
    });

    describe('Created subscription object', () => {
      it('When generating a subscription, then it should have default values', () => {
        const subscription = createdSubscription();

        expect(subscription.id).toMatch(/^sub_/);
        expect(subscription.status).toBe('active');
      });

      it('When passing custom parameters, then it should override the defaults', () => {
        const subscription = createdSubscription({ status: 'canceled' });

        expect(subscription.status).toBe('canceled');
      });
    });

    describe('Active subscriptions', () => {
      it('When generating active subscriptions, then it should return the specified number of subscriptions', () => {
        const subscriptions = mockActiveSubscriptions(2, [{ id: 'sub_123' }, { id: 'sub_456' }]);

        expect(subscriptions).toHaveLength(2);
        expect(subscriptions[0].id).toBe('sub_123');
        expect(subscriptions[1].id).toBe('sub_456');
      });
    });
  });
});
