import { Stripe } from 'stripe';
import axios from 'axios';
import { TiersService } from '../../../src/services/tiers.service';
import { PaymentService } from '../../../src/services/payment.service';
import { UsersService } from '../../../src/services/users.service';
import { StorageService } from '../../../src/services/storage.service';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';
import { ProductsService } from '../../../src/services/products.service';
import { LicenseCodesService } from '../../../src/services/licenseCodes.service';
import CacheService from '../../../src/services/cache.service';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { LicenseCodesRepository } from '../../../src/core/users/LicenseCodeRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import testFactory from '../utils/factory';
import config from '../../../src/config';
import { DetermineLifetimeConditions } from '../../../src/core/users/DetermineLifetimeConditions';
import { ObjectStorageWebhookHandler } from '../../../src/webhooks/events/ObjectStorageWebhookHandler';
import { InvoiceCompletedHandler } from '../../../src/webhooks/events/invoices/InvoiceCompletedHandler';
import { getLogger } from '../fixtures';
import { UserFeatureOverridesRepository } from '../../../src/core/users/MongoDBUserFeatureOverridesRepository';
import { UserFeaturesOverridesService } from '../../../src/services/userFeaturesOverride.service';

export interface TestServices {
  stripe: Stripe;
  tiersService: TiersService;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  bit2MeService: Bit2MeService;
  objectStorageService: ObjectStorageService;
  productsService: ProductsService;
  licenseCodesService: LicenseCodesService;
  cacheService: CacheService;
  determineLifetimeConditions: DetermineLifetimeConditions;
  objectStorageWebhookHandler: ObjectStorageWebhookHandler;
  invoiceCompletedHandler: InvoiceCompletedHandler;
  userFeaturesOverridesService: UserFeaturesOverridesService;
}

export interface TestRepositories {
  tiersRepository: TiersRepository;
  usersRepository: UsersRepository;
  displayBillingRepository: DisplayBillingRepository;
  couponsRepository: CouponsRepository;
  usersCouponsRepository: UsersCouponsRepository;
  usersTiersRepository: UsersTiersRepository;
  productsRepository: ProductsRepository;
  licenseCodesRepository: LicenseCodesRepository;
  userFeatureOverridesRepository: UserFeatureOverridesRepository;
}

export interface TestServiceOverrides {
  stripe?: any;
}

const createRepositories = (): TestRepositories => ({
  tiersRepository: testFactory.getTiersRepository(),
  usersRepository: testFactory.getUsersRepositoryForTest(),
  displayBillingRepository: {} as DisplayBillingRepository,
  couponsRepository: testFactory.getCouponsRepositoryForTest(),
  usersCouponsRepository: testFactory.getUsersCouponsRepositoryForTest(),
  usersTiersRepository: testFactory.getUsersTiersRepository(),
  productsRepository: testFactory.getProductsRepositoryForTest(),
  licenseCodesRepository: testFactory.getLicenseCodesRepositoryForTest(),
  userFeatureOverridesRepository: testFactory.getUserFeaturesOverridesRepositoryForTest(),
});

export const createTestServices = (overrides: TestServiceOverrides = {}): TestServices & TestRepositories => {
  const repositories = createRepositories();

  const stripe = overrides.stripe ?? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
  const bit2MeService = new Bit2MeService(config, axios);
  const paymentService = new PaymentService(stripe, repositories.productsRepository, bit2MeService);
  const storageService = new StorageService(config, axios);
  const usersService = new UsersService(
    repositories.usersRepository,
    paymentService,
    repositories.displayBillingRepository,
    repositories.couponsRepository,
    repositories.usersCouponsRepository,
    config,
    axios,
  );
  const cacheService = new CacheService(config);
  const tiersService = new TiersService(
    usersService,
    paymentService,
    repositories.tiersRepository,
    repositories.usersTiersRepository,
    storageService,
    config,
  );
  const licenseCodesService = new LicenseCodesService({
    paymentService,
    usersService,
    licenseCodesRepository: repositories.licenseCodesRepository,
  });
  const objectStorageService = new ObjectStorageService(paymentService, config, axios);
  const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
  const objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService);
  const invoiceCompletedHandler = new InvoiceCompletedHandler({
    logger: getLogger(),
    determineLifetimeConditions,
    objectStorageWebhookHandler,
    paymentService,
    storageService,
    tiersService,
    usersService,
    cacheService,
  });
  const userFeaturesOverridesService = new UserFeaturesOverridesService(
    usersService,
    repositories.userFeatureOverridesRepository,
  );
  const productsService = new ProductsService(tiersService, usersService, userFeaturesOverridesService);

  return {
    stripe,
    tiersService,
    paymentService,
    usersService,
    storageService,
    bit2MeService,
    objectStorageService,
    productsService,
    licenseCodesService,
    cacheService,
    determineLifetimeConditions,
    objectStorageWebhookHandler,
    invoiceCompletedHandler,
    userFeaturesOverridesService,
    ...repositories,
  };
};
