import Stripe from 'stripe';

import {
  PaymentIntent,
  PaymentService,
  PromotionCode,
  SubscriptionCreated,
} from '../../../src/services/payment.service';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import testFactory from '../utils/factory';
import envVariablesConfig from '../../../src/config';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';

let productsRepository: ProductsRepository;
let paymentService: PaymentService;

let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;

const customerPayload = {
  email: 'test@example.com',
  name: 'Test User',
};

const requestPayload = {
  customerId: 'cId',
  amount: 100,
  priceId: 'price_id',
  promotion_code: 'promo_code',
};

const mockCustomer = { id: 'cus_12345', email: 'test@example.com', name: 'Test User' };

const mockPromotionCodeResponse = {
  id: 'promo_id',
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

const promotionCodeName = 'PROMOCODE';

describe('Payments Service tests', () => {
  beforeEach(() => {
    productsRepository = testFactory.getProductsRepositoryForTest();
    paymentService = new PaymentService(
      new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
      productsRepository,
      usersRepository,
    );

    usersRepository = testFactory.getUsersRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    displayBillingRepository = testFactory.displayBillingRepositoryForTest();
  });

  describe('Creating a customer', () => {
    it('should create a customer with email and name with a given parameters', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockImplementation(() => Promise.resolve(mockCustomer as unknown as Stripe.Customer));

      await paymentService.createCustomer(customerPayload);

      expect(customerCreatedSpy).toHaveBeenCalledWith(customerPayload);
    });
  });

  describe('Fetching the promotion code object', () => {
    it('should get the promo code ID, amount off or discounted off', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'getPromotionCodeByName')
        .mockImplementation(() => Promise.resolve(mockPromotionCodeResponse as unknown as PromotionCode));

      const promotionCode = await paymentService.getPromotionCodeByName('priceId', promotionCodeName);

      expect(customerCreatedSpy).toHaveBeenCalledWith('priceId', promotionCodeName);
      expect(promotionCode).toEqual(mockPromotionCodeResponse);
    });
  });

  describe('Creating a subscription', () => {
    it('Should create a subscription with all params', async () => {
      const subscriptionCreatedSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockImplementation(() => Promise.resolve(mockCreateSubscriptionResponse as unknown as SubscriptionCreated));

      const subscription = await paymentService.createSubscription({
        customerId: requestPayload.customerId,
        priceId: requestPayload.priceId,
        promoCodeId: requestPayload.promotion_code,
      });

      expect(subscriptionCreatedSpy).toHaveBeenCalledWith({
        customerId: requestPayload.customerId,
        priceId: requestPayload.priceId,
        promoCodeId: requestPayload.promotion_code,
      });
      expect(subscription).toEqual(mockCreateSubscriptionResponse);
    });
  });

  describe('Obtain the paymentIntent customer secret', () => {
    it('Should return the client secret to pay in the client side', async () => {
      const paymentIntentSpy = jest
        .spyOn(paymentService, 'createPaymentIntent')
        .mockImplementation(() => Promise.resolve(paymentIntentResponse as unknown as PaymentIntent));

      const paymentIntent = await paymentService.createPaymentIntent(
        requestPayload.customerId,
        requestPayload.amount,
        requestPayload.priceId,
        requestPayload.promotion_code,
      );

      expect(paymentIntentSpy).toHaveBeenCalledWith(
        requestPayload.customerId,
        requestPayload.amount,
        requestPayload.priceId,
        requestPayload.promotion_code,
      );
      expect(paymentIntent).toEqual(paymentIntentResponse);
    });
  });
});
