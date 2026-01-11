import Stripe from 'stripe';
import { getPaymentIntent, getLogger, getCustomer, getCreateSubscriptionResponse } from '../fixtures';
import { FastifyBaseLogger } from 'fastify';
import handleFundsCaptured from '../../../src/webhooks/handleFundsCaptured';
import { BadRequestError, ConflictError, GoneError, InternalServerError } from '../../../src/errors/Errors';
import { UserSubscription, UserType } from '../../../src/core/users/User';
import { createTestServices } from '../helpers/services-factory';
import { objectStorageService } from '../../../src/services/objectStorage.service';

const logger: jest.Mocked<FastifyBaseLogger> = getLogger();

const stripeMock = {
  paymentIntents: {
    cancel: jest.fn(),
  },
};
const { paymentService, stripe } = createTestServices({
  stripe: stripeMock,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Handling captured funds from a payment method', () => {
  describe('Checking the metadata', () => {
    it('When the payment intent does not contains the object-storage type in the metadata, then do nothing', async () => {
      const mockPaymentIntent = getPaymentIntent();
      const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer');

      await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

      expect(getCustomerSpy).not.toHaveBeenCalled();
    });

    it('When the payment intent has a type value in metadata but it is not object-storage, then do nothing', async () => {
      const mockPaymentIntent = getPaymentIntent({
        metadata: {
          type: 'business',
        },
      });
      const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer');

      await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

      expect(getCustomerSpy).not.toHaveBeenCalled();
    });

    it('When the payment intent contains the type but not the ID of the price the user wants to subscribe to, then do nothing', async () => {
      const mockPaymentIntent = getPaymentIntent({
        metadata: {
          type: 'object-storage',
        },
      });
      const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer');

      await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

      expect(getCustomerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Customer check', () => {
    it('When the user does not exists, then an error indicating so is thrown', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = { deleted: true } as Stripe.DeletedCustomer;
      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.DeletedCustomer>);

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(GoneError);
    });

    it('The user exists but does not have an email, then an error indicating so is thrown', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer({
        email: '',
      });
      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('Cancelling the Verification Payment Intent', () => {
    it('When the payment intent has been already cancelled, then the payment intent cancellation is skipped', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
        status: 'canceled',
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      const cancelPaymentIntentSpy = jest.spyOn(stripe.paymentIntents, 'cancel');
      const getUserSubscriptionSpy = jest
        .spyOn(paymentService, 'getUserSubscription')
        .mockResolvedValue({ type: 'free' });
      const createdSubscriptionSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockResolvedValue(mockSubscription);
      const objectStorageInitializationSpy = jest
        .spyOn(objectStorageService, 'initObjectStorageUser')
        .mockResolvedValue();

      await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

      expect(cancelPaymentIntentSpy).not.toHaveBeenCalled();
      expect(getUserSubscriptionSpy).toHaveBeenCalledWith(mockCustomer.id, UserType.ObjectStorage);
      expect(createdSubscriptionSpy).toHaveBeenCalledWith({
        customerId: mockCustomer.id,
        priceId: mockedPrice,
        additionalOptions: {
          default_payment_method: mockPaymentIntent.payment_method as string,
          off_session: true,
          automatic_tax: {
            enabled: true,
          },
        },
      });
      expect(objectStorageInitializationSpy).toHaveBeenCalledWith({
        email: mockCustomer.email,
        customerId: mockCustomer.id,
      });
    });

    it('When an unexpected error occurs while cancelling the payment intent, then an error indicating so is thrown', async () => {
      const unexpectedError = new InternalServerError('Unexpected Error');
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      jest.spyOn(stripe.paymentIntents, 'cancel').mockRejectedValue(unexpectedError);
      const getUserSubscriptionSpy = jest
        .spyOn(paymentService, 'getUserSubscription')
        .mockResolvedValue({ type: 'free' });
      const createdSubscriptionSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockResolvedValue(mockSubscription);
      const objectStorageInitializationSpy = jest
        .spyOn(objectStorageService, 'initObjectStorageUser')
        .mockResolvedValue();

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(unexpectedError);

      expect(getUserSubscriptionSpy).not.toHaveBeenCalled();
      expect(createdSubscriptionSpy).not.toHaveBeenCalled();
      expect(objectStorageInitializationSpy).not.toHaveBeenCalled();
    });
  });

  describe('Creating object storage subscription', () => {
    it('When the subscription is already created, then the creation of the subscription is skipped', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      const cancelPaymentIntentSpy = jest
        .spyOn(stripe.paymentIntents, 'cancel')
        .mockResolvedValue(mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
      const getUserSubscriptionSpy = jest
        .spyOn(paymentService, 'getUserSubscription')
        .mockResolvedValue({ type: 'subscription' } as unknown as UserSubscription);
      const createdSubscriptionSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockResolvedValue(mockSubscription);
      const objectStorageInitializationSpy = jest
        .spyOn(objectStorageService, 'initObjectStorageUser')
        .mockResolvedValue();

      await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

      expect(cancelPaymentIntentSpy).toHaveBeenCalledWith(mockPaymentIntent.id);
      expect(getUserSubscriptionSpy).toHaveBeenCalledWith(mockCustomer.id, UserType.ObjectStorage);
      expect(createdSubscriptionSpy).not.toHaveBeenCalled();
      expect(objectStorageInitializationSpy).toHaveBeenCalledWith({
        email: mockCustomer.email,
        customerId: mockCustomer.id,
      });
    });

    it('When an error occurs while creating subscription, then an error indicating so is thrown', async () => {
      const unexpectedError = new InternalServerError('Something went wrong while creating subscription');
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      const cancelPaymentIntentSpy = jest
        .spyOn(stripe.paymentIntents, 'cancel')
        .mockResolvedValue(mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
      const getUserSubscriptionSpy = jest
        .spyOn(paymentService, 'getUserSubscription')
        .mockRejectedValue(unexpectedError);
      const createdSubscriptionSpy = jest
        .spyOn(paymentService, 'createSubscription')
        .mockResolvedValue(mockSubscription);
      const objectStorageInitializationSpy = jest
        .spyOn(objectStorageService, 'initObjectStorageUser')
        .mockResolvedValue();

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(unexpectedError);

      expect(cancelPaymentIntentSpy).toHaveBeenCalledWith(mockPaymentIntent.id);
      expect(getUserSubscriptionSpy).toHaveBeenCalledWith(mockCustomer.id, UserType.ObjectStorage);
      expect(createdSubscriptionSpy).not.toHaveBeenCalled();
      expect(objectStorageInitializationSpy).not.toHaveBeenCalled();
    });
  });

  it('When the funds are captured, then the payment intent is cancelled, the subscription is created and the object storage account is initialized', async () => {
    const mockedPrice = 'price_id';
    const mockPaymentIntent = getPaymentIntent({
      metadata: { type: 'object-storage', priceId: mockedPrice },
    });
    const mockCustomer = getCustomer();
    const mockSubscription = getCreateSubscriptionResponse();

    jest
      .spyOn(paymentService, 'getCustomer')
      .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
    const cancelPaymentIntentSpy = jest
      .spyOn(stripe.paymentIntents, 'cancel')
      .mockResolvedValue(mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
    const getUserSubscriptionSpy = jest
      .spyOn(paymentService, 'getUserSubscription')
      .mockResolvedValue({ type: 'free' });
    const createdSubscriptionSpy = jest.spyOn(paymentService, 'createSubscription').mockResolvedValue(mockSubscription);
    const objectStorageInitializationSpy = jest
      .spyOn(objectStorageService, 'initObjectStorageUser')
      .mockResolvedValue();

    await handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger);

    expect(cancelPaymentIntentSpy).toHaveBeenCalledWith(mockPaymentIntent.id);
    expect(getUserSubscriptionSpy).toHaveBeenCalledWith(mockCustomer.id, UserType.ObjectStorage);
    expect(createdSubscriptionSpy).toHaveBeenCalledWith({
      customerId: mockCustomer.id,
      priceId: mockedPrice,
      additionalOptions: {
        default_payment_method: mockPaymentIntent.payment_method as string,
        off_session: true,
        automatic_tax: {
          enabled: true,
        },
      },
    });
    expect(objectStorageInitializationSpy).toHaveBeenCalledWith({
      email: mockCustomer.email,
      customerId: mockCustomer.id,
    });
  });

  describe('Initializing Object Storage account', () => {
    it('if the user already has an account activated, then an error indicating so is thrown', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      jest
        .spyOn(stripe.paymentIntents, 'cancel')
        .mockResolvedValue(mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(paymentService, 'createSubscription').mockResolvedValue(mockSubscription);
      jest.spyOn(objectStorageService, 'initObjectStorageUser').mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: 'Account already exists' },
        },
        message: 'Conflict',
      });

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(ConflictError);
      expect(logger.error).toHaveBeenCalledWith('The user already has an Object Storage account activated');
    });

    it('if an unexpected error occurs while initializing the object storage account, then an error indicating so is thrown', async () => {
      const mockedPrice = 'price_id';
      const mockPaymentIntent = getPaymentIntent({
        metadata: { type: 'object-storage', priceId: mockedPrice },
      });
      const mockCustomer = getCustomer();
      const mockSubscription = getCreateSubscriptionResponse();

      jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockCustomer as unknown as Stripe.Response<Stripe.Customer>);
      jest
        .spyOn(stripe.paymentIntents, 'cancel')
        .mockResolvedValue(mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(paymentService, 'createSubscription').mockResolvedValue(mockSubscription);
      jest.spyOn(objectStorageService, 'initObjectStorageUser').mockRejectedValue(new Error());

      await expect(
        handleFundsCaptured(mockPaymentIntent, paymentService, objectStorageService, stripe, logger),
      ).rejects.toThrow(Error);
    });
  });
});
