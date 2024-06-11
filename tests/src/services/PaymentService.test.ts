import axios from 'axios';
import Stripe from 'stripe';

import { PaymentIntentObject, PaymentService, SubscriptionCreatedObject } from '../../../src/services/PaymentService';
import { StorageService } from '../../../src/services/StorageService';
import { UsersService } from '../../../src/services/UsersService';
import config from '../../../src/config';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import testFactory from '../utils/factory';

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;

const customerPayload = {
  correctPayload: { email: 'test@example.com', name: 'Test User' },
  wrongPayload: {},
};

const requestPayload = {
  customerId: 'cId',
  amount: 100,
  priceId: 'price_id',
  promotion_code: 'promo_code',
};

const mockCustomer = { id: 'cus_12345', email: 'test@example.com', name: 'Test User' };

const mockCreateSubscriptionResponse = {
  type: 'payment',
  clientSecret: 'client_secret',
};

const paymentIntentResponse = 'client_secret';

describe('Payments Service tests', () => {
  beforeEach(() => {
    paymentService = new PaymentService(new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' }));
    storageService = new StorageService(config, axios);
    usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
    );

    usersRepository = testFactory.getUsersRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    displayBillingRepository = testFactory.displayBillingRepositoryForTest();
  });

  describe('Creating a customer', () => {
    it('should create a customer with email and name as a given parameters', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockImplementation(() => Promise.resolve(mockCustomer as unknown as Stripe.Customer));

      await paymentService.createCustomer(customerPayload.correctPayload);

      expect(customerCreatedSpy).toHaveBeenCalledWith(customerPayload.correctPayload);
    });
  });

  describe('Creating a subscription', () => {
    it('Should create a subscription with all params', async () => {
      const subscriptionCreatedSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockImplementation(() =>
          Promise.resolve(mockCreateSubscriptionResponse as unknown as SubscriptionCreatedObject),
        );

      const subscription = await paymentService.createSubscription(
        requestPayload.customerId,
        requestPayload.priceId,
        requestPayload.promotion_code,
      );

      expect(subscriptionCreatedSpy).toHaveBeenCalledWith(requestPayload.customerId, requestPayload.priceId);
      expect(subscription).toHaveProperty([
        requestPayload.customerId,
        requestPayload.priceId,
        requestPayload.promotion_code,
      ]);
    });
  });

  describe('Obtain the paymentIntent customer secret', () => {
    it('Should return the client secret to pay in the client side', async () => {
      const paymentIntentSpy = jest
        .spyOn(paymentService, 'getPaymentIntent')
        .mockImplementation(() => Promise.resolve(paymentIntentResponse as unknown as PaymentIntentObject));

      const paymentIntent = await paymentService.getPaymentIntent(
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
      expect(paymentIntent).toHaveProperty([paymentIntentResponse]);
    });
  });
});
