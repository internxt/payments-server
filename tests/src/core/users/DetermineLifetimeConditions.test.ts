import axios from 'axios';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { StorageService } from '../../../../src/services/storage.service';
import { TierNotFoundError, TiersService } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import Stripe from 'stripe';
import { DetermineLifetimeConditions, OldProductError } from '../../../../src/core/users/DetermineLifetimeConditions';
import { getUser, getSubscription, newTier, getCustomer } from '../../fixtures';
import { Service } from '../../../../src/core/users/Tier';

let tiersService: TiersService;
let paymentsService: PaymentService;
let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let storageService: StorageService;
let determineLifetimeConditions: DetermineLifetimeConditions;

beforeAll(() => {
  tiersRepository = testFactory.getTiersRepository();
  usersRepository = testFactory.getUsersRepositoryForTest();
  paymentsService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    bit2MeService,
  );
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  usersTiersRepository = testFactory.getUsersTiersRepository();
  productsRepository = testFactory.getProductsRepositoryForTest();
  usersTiersRepository = testFactory.getUsersTiersRepository();
  bit2MeService = new Bit2MeService(config, axios);
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    bit2MeService,
  );
  usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
  storageService = new StorageService(config, axios);
  tiersService = new TiersService(
    usersService,
    paymentService,
    tiersRepository,
    usersTiersRepository,
    storageService,
    config,
  );

  determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
});

describe('Determining Lifetime conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('When the product is old, an error indicating so is thrown', async () => {
    const mockedUser = getUser();

    jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(TierNotFoundError);

    await expect(determineLifetimeConditions.determine(mockedUser, 'invalid_product_id')).rejects.toThrow(
      OldProductError,
    );
  });

  describe('The user is free', () => {
    it('When the user is free, then the tier and the maxSpaceBytes tier field are returned', async () => {
      const mockedUser = getUser({
        lifetime: false,
      });
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);

      expect(tier).toStrictEqual(mockedTier);
      expect(maxSpaceBytes).toStrictEqual(mockedTier.featuresPerService[Service.Drive].maxSpaceBytes);
    });
  });

  describe('The user already has a subscription', () => {
    it('When the user has an active subscription, then the subscription is cancelled and the lifetime tier is returned', async () => {
      const mockedUser = getUser({
        lifetime: false,
      });
      const mockedUserSubscription = getSubscription({ type: 'subscription' });
      const subscriptionId = mockedUserSubscription.type === 'subscription' && mockedUserSubscription.subscriptionId;
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedUserSubscription);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockResolvedValue();

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);

      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(1);
      expect(cancelSubscriptionSpy).toHaveBeenCalledWith(subscriptionId as string);
      expect(tier).toStrictEqual(mockedTier);
      expect(maxSpaceBytes).toStrictEqual(tier.featuresPerService[Service.Drive].maxSpaceBytes);
    });
  });

  describe('The user already has a lifetime plan', () => {
    it('When the customer is deleted, an error indicating so is thrown', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({
        deleted: true,
        id: mockedUser.customerId,
        object: 'customer',
      } as Stripe.DeletedCustomer & {
        lastResponse: {
          headers: { [key: string]: string };
          requestId: string;
          statusCode: number;
          apiVersion?: string;
          idempotencyKey?: string;
          stripeAccount?: string;
        };
      });

      await expect(determineLifetimeConditions.determine(mockedUser, mockedTier.productId)).rejects.toThrow(Error);
    });

    describe('The user has invoices', () => {
      it('When the user has invoices without charge Id, checks if the invoice has the charge Id in the metadata object', async () => {
        const mockedUser = getUser({
          lifetime: true,
        });
        const mockedTier = newTier({
          billingType: 'lifetime',
        });
        const mockedSubscription = getSubscription({
          type: 'lifetime',
        });
        const mockedCustomer = getCustomer();

        jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedSubscription);
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(
          mockedCustomer as Stripe.Customer & {
            lastResponse: {
              headers: { [key: string]: string };
              requestId: string;
              statusCode: number;
              apiVersion?: string;
              idempotencyKey?: string;
              stripeAccount?: string;
            };
          },
        );
        jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([getCustomer(), getCustomer()]);

        const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);
      });
    });
  });
});
