import Stripe from 'stripe';
import axios from 'axios';
import { PaymentService } from '../../../../src/services/payment.service';
import { StorageService } from '../../../../src/services/storage.service';
import { UsersService } from '../../../../src/services/users.service';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import CacheService from '../../../../src/services/cache.service';
import { ObjectStorageService } from '../../../../src/services/objectStorage.service';
import { ObjectStorageWebhookHandler } from '../../../../src/webhooks/events/ObjectStorageWebhookHandler';
import { TiersService } from '../../../../src/services/tiers.service';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import { getLogger, getProduct } from '../../fixtures';

jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    disconnect: jest.fn(),
    quit: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let tierRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let objectStorageService: ObjectStorageService;
let objectStorageWebhookHandler: ObjectStorageWebhookHandler;
let tiersService: TiersService;

describe('Object Storage Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    tierRepository = testFactory.getTiersRepository();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    productsRepository = testFactory.getProductsRepositoryForTest();

    cacheService = new CacheService(config);
    storageService = new StorageService(config, axios);
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);

    usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
      config,
      axios,
    );

    tiersService = new TiersService(
      usersService,
      paymentService,
      tierRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    objectStorageService = new ObjectStorageService(paymentService, config, axios);
    objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService, getLogger());
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Is An Object Storage Product', () => {
    test('When the product is an object storage type, then it should return true', () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });

      const mockedObjectStorageWebhookHandler =
        objectStorageWebhookHandler['isObjectStorageProduct'].bind(objectStorageWebhookHandler);

      const isObjectStorageProduct = mockedObjectStorageWebhookHandler(mockedProduct);

      expect(isObjectStorageProduct).toBeTruthy();
    });

    test('When the product is not an object storage type, then it should return false', () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'not-object-storage',
          },
        },
      });

      const mockedObjectStorageWebhookHandler =
        objectStorageWebhookHandler['isObjectStorageProduct'].bind(objectStorageWebhookHandler);
      const isObjectStorageProduct = mockedObjectStorageWebhookHandler(mockedProduct);

      expect(isObjectStorageProduct).toBeFalsy();
    });
  });

  describe('Reactivate Object Storage Account', () => {});
});
