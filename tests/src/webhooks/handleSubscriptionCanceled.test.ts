import Stripe from 'stripe';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import CacheService from '../../../src/services/cache.service';
import { PaymentService } from '../../../src/services/payment.service';
import { StorageService, updateUserTier } from '../../../src/services/storage.service';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { FastifyBaseLogger } from 'fastify';
import { getCreatedSubscription, getCustomer, getLogger, getProduct, getUser } from '../fixtures';
import testFactory from '../utils/factory';
import config from '../../../src/config';
import axios from 'axios';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';
import handleSubscriptionCanceled from '../../../src/webhooks/handleSubscriptionCanceled';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../../../src/constants';

jest.mock('stripe', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});
jest.mock('../../../src/services/cache.service', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});
jest.mock('../../../src/webhooks/utils/handleCancelPlan');
jest.mock('../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../src/services/storage.service');

  return {
    ...actualModule,
    updateUserTier: jest.fn(),
  };
});

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let tiersService: TiersService;
let tiersRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let objectStorageService: ObjectStorageService;
let logger: jest.Mocked<FastifyBaseLogger>;

beforeEach(() => {
  logger = getLogger();

  stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  productsRepository = testFactory.getProductsRepositoryForTest();
  tiersRepository = testFactory.getTiersRepository();
  usersTiersRepository = testFactory.getUsersTiersRepository();

  cacheService = new CacheService(config);
  storageService = new StorageService(config, axios);
  bit2MeService = new Bit2MeService(config, axios);
  paymentService = new PaymentService(stripe, productsRepository, bit2MeService);

  tiersService = new TiersService(
    usersService,
    paymentService,
    tiersRepository,
    usersTiersRepository,
    storageService,
    config,
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

  objectStorageService = new ObjectStorageService(paymentService, config, axios);

  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Process when a subscription is cancelled', () => {
  it('When the cancellation of a subscription that have Tier is requested, then it is cancelled successfully', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();

    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const getCustomerSPy = jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
      logger,
      config,
    );

    expect(getProductSpy).toHaveBeenCalledWith(mockedSubscription.items.data[0].price.product);
    expect(getCustomerSPy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(handleCancelPlan).toHaveBeenCalledWith({
      customerId: mockedSubscription.customer,
      customerEmail: mockedCustomer.email,
      productId: mockedSubscription.items.data[0].price.product,
      usersService,
      tiersService,
      log: logger,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const tierNotFoundError = new TierNotFoundError('Tier not found');

    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const getCustomerSPy = jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();
    (handleCancelPlan as jest.Mock).mockRejectedValue(tierNotFoundError);

    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
      logger,
      config,
    );

    expect(getProductSpy).toHaveBeenCalledWith(mockedSubscription.items.data[0].price.product);
    expect(getCustomerSPy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(handleCancelPlan).rejects.toThrow(tierNotFoundError);
    expect(updateUserTier).toHaveBeenCalledWith(mockedUser.uuid, FREE_INDIVIDUAL_TIER, config);
    expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
  });

  it('When the cancellation of a subscription has a Tier but an unknown error occurs, then an error indicating so is thrown', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const randomError = new Error('Tier not found');

    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    (handleCancelPlan as jest.Mock).mockRejectedValue(randomError);

    await expect(
      handleSubscriptionCanceled(
        storageService,
        usersService,
        paymentService,
        mockedSubscription,
        cacheService,
        objectStorageService,
        tiersService,
        logger,
        config,
      ),
    ).rejects.toThrow(randomError);
  });
});
