import Stripe from 'stripe';

import {
  PaymentIntent,
  PaymentService,
  PromotionCode,
  SubscriptionCreated,
} from '../../../src/services/payment.service';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import testFactory from '../utils/factory';
import envVariablesConfig from '../../../src/config';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import getMocks from '../mocks';

let productsRepository: ProductsRepository;
let paymentService: PaymentService;

let usersRepository: UsersRepository;

const mocks = getMocks();

describe('Payments Service tests', () => {
  beforeEach(() => {
    productsRepository = testFactory.getProductsRepositoryForTest();
    paymentService = new PaymentService(
      new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
      productsRepository,
      usersRepository,
    );
  });

  describe('Creating a customer', () => {
    it('should create a customer with email and name with a given parameters', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockImplementation(() => Promise.resolve(mocks.mockedUser as unknown as Stripe.Customer));

      await paymentService.createCustomer(mocks.mockedCustomerPayload);

      expect(customerCreatedSpy).toHaveBeenCalledWith(mocks.mockedCustomerPayload);
    });
  });

  describe('Fetching the promotion code object', () => {
    it('should get the promo code ID, amount off or discounted off', async () => {
      const customerCreatedSpy = jest
        .spyOn(paymentService, 'getPromotionCodeByName')
        .mockImplementation(() => Promise.resolve(mocks.mockPromotionCodeResponse as unknown as PromotionCode));

      const promotionCode = await paymentService.getPromotionCodeByName('priceId', mocks.couponName.valid);

      expect(customerCreatedSpy).toHaveBeenCalledWith('priceId', mocks.couponName.valid);
      expect(promotionCode).toEqual(mocks.mockPromotionCodeResponse);
    });
  });

  describe('Creating a subscription', () => {
    it('Should create a subscription with all params', async () => {
      const subscriptionCreatedSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockImplementation(() =>
          Promise.resolve(mocks.mockCreateSubscriptionResponse as unknown as SubscriptionCreated),
        );

      const subscription = await paymentService.createSubscription({
        customerId: mocks.createdSubscriptionPayload.customerId,
        priceId: mocks.createdSubscriptionPayload.priceId,
        promoCodeId: mocks.createdSubscriptionPayload.promotion_code,
      });

      expect(subscriptionCreatedSpy).toHaveBeenCalledWith({
        customerId: mocks.createdSubscriptionPayload.customerId,
        priceId: mocks.createdSubscriptionPayload.priceId,
        promoCodeId: mocks.createdSubscriptionPayload.promotion_code,
      });
      expect(subscription).toEqual(mocks.mockCreateSubscriptionResponse);
    });
  });

  describe('Obtain the paymentIntent customer secret', () => {
    it('Should return the client secret to pay in the client side', async () => {
      const paymentIntentSpy = jest
        .spyOn(paymentService, 'createPaymentIntent')
        .mockImplementation(() => Promise.resolve(mocks.paymentIntentResponse as unknown as PaymentIntent));

      const paymentIntent = await paymentService.createPaymentIntent(
        mocks.createdSubscriptionPayload.customerId,
        mocks.createdSubscriptionPayload.amount,
        mocks.createdSubscriptionPayload.priceId,
        mocks.createdSubscriptionPayload.promotion_code,
      );
      expect(paymentIntentSpy).toHaveBeenCalledWith(
        mocks.createdSubscriptionPayload.customerId,
        mocks.createdSubscriptionPayload.amount,
        mocks.createdSubscriptionPayload.priceId,
        mocks.createdSubscriptionPayload.promotion_code,
      );
      expect(paymentIntent).toEqual(mocks.paymentIntentResponse);
    });
  });
});
