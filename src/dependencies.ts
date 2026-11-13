import axios from 'axios';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

import { type AppConfig } from './config';
import { STRIPE_API_VERSION } from './constants';
import { MongoDBCouponsRepository } from './core/coupons/MongoDBCouponsRepository';
import { MongoDBUsersCouponsRepository } from './core/coupons/MongoDBUsersCouponsRepository';
import { DynamicConfigKey } from './core/infra/DynamicConfigRepository';
import { MongoDBDynamicConfigRepository } from './core/infra/MongoDBDynamicConfigRepository';
import { DetermineLifetimeConditions } from './core/users/DetermineLifetimeConditions';
import { MongoDBDisplayBillingRepository } from './core/users/MongoDBDisplayBillingRepository';
import { MongoDBLicenseCodesRepository } from './core/users/MongoDBLicenseCodesRepository';
import { MongoDBProductsRepository } from './core/users/MongoDBProductsRepository';
import { MongoDBTiersRepository } from './core/users/MongoDBTiersRepository';
import { MongoDBUserFeatureOverridesRepository } from './core/users/MongoDBUserFeatureOverridesRepository';
import { MongoDBUsersRepository } from './core/users/MongoDBUsersRepository';
import { MongoDBUsersTiersRepository } from './core/users/MongoDBUsersTiersRepository';
import { stripePaymentsAdapter } from './infrastructure/adapters/stripe.adapter';
import { createHttpClient } from './infrastructure/http/httpClient';
import CacheService from './services/cache.service';
import { ConfirmationTokenService } from './services/confirmationToken.service';
import { HealthService } from './services/health.service';
import { LicenseCodesService } from './services/licenseCodes.service';
import { MailService } from './services/mail.service';
import { ObjectStorageService } from './services/objectStorage.service';
import { PaymentService } from './services/payment.service';
import { PreCreatedUserService } from './services/preCreatedUser.service';
import { ProductsService } from './services/products.service';
import { StorageService } from './services/storage.service';
import { TiersService } from './services/tiers.service';
import { UserFeaturesOverridesService } from './services/userFeaturesOverride.service';
import { UsersService } from './services/users.service';
import { ObjectStorageWebhookHandler } from './webhooks/events/ObjectStorageWebhookHandler';
import { InvoiceCompletedHandler } from './webhooks/events/invoices/InvoiceCompletedHandler';

export interface Dependencies {
  config: AppConfig;
  stripe: Stripe;
  paymentService: PaymentService;
  storageService: StorageService;
  usersService: UsersService;
  cacheService: CacheService;
  tiersService: TiersService;
  licenseCodesService: LicenseCodesService;
  objectStorageService: ObjectStorageService;
  userFeaturesOverridesService: UserFeaturesOverridesService;
  productsService: ProductsService;
  healthService: HealthService;
  preCreatedUserService: PreCreatedUserService;
  confirmationTokenService: ConfirmationTokenService;
  determineLifetimeConditions: DetermineLifetimeConditions;
  invoiceCompletedHandler: InvoiceCompletedHandler;
  /** Closes the connections the app keeps open (Redis and Mongo). */
  closeConnections: () => Promise<void>;
}

/**
 * Builds every repository, client and service of the app once. It is the only place that wires them together
 * (used by the server, the CLI scripts and the tests).
 */
export async function buildDependencies({
  config,
  mongoClient,
}: {
  config: AppConfig;
  mongoClient: MongoClient;
}): Promise<Dependencies> {
  const usersRepository = new MongoDBUsersRepository(mongoClient);
  const licenseCodesRepository = new MongoDBLicenseCodesRepository(mongoClient);
  const displayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
  const couponsRepository = new MongoDBCouponsRepository(mongoClient);
  const usersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
  const productsRepository = new MongoDBProductsRepository(mongoClient);
  const tiersRepository = new MongoDBTiersRepository(mongoClient);
  const usersTiersRepository = new MongoDBUsersTiersRepository(mongoClient);
  const userFeatureOverridesRepository = new MongoDBUserFeatureOverridesRepository(mongoClient);
  const dynamicConfigRepository = new MongoDBDynamicConfigRepository(mongoClient);

  let stripe: Stripe;
  try {
    const stripeKeyOverride = await dynamicConfigRepository.get(DynamicConfigKey.StripeKey);
    stripe = new Stripe(stripeKeyOverride ?? config.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    stripePaymentsAdapter.initProvider(stripe);
    await stripePaymentsAdapter.syncTaxRegistrations();
  } catch (error) {
    await mongoClient.close();
    throw error;
  }

  const paymentService = new PaymentService(stripe, productsRepository);
  const storageService = new StorageService(config, axios);
  const usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
  const cacheService = new CacheService(config);
  const mailService = new MailService(config, axios);
  const tiersService = new TiersService(
    usersService,
    tiersRepository,
    usersTiersRepository,
    storageService,
    mailService,
  );
  const licenseCodesService = new LicenseCodesService({ paymentService, usersService, licenseCodesRepository });
  const objectStorageService = new ObjectStorageService(paymentService, config, axios);
  const userFeaturesOverridesService = new UserFeaturesOverridesService(usersService, userFeatureOverridesRepository);
  const productsService = new ProductsService(tiersService, usersService, userFeaturesOverridesService);
  const healthService = new HealthService(mongoClient, cacheService);
  const preCreatedUserService = new PreCreatedUserService(createHttpClient(), config);
  const confirmationTokenService = new ConfirmationTokenService(cacheService);

  const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
  const objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService);
  const invoiceCompletedHandler = new InvoiceCompletedHandler({
    determineLifetimeConditions,
    objectStorageWebhookHandler,
    paymentService,
    storageService,
    tiersService,
    usersService,
    cacheService,
    preCreatedUserService,
  });

  const closeConnections = async () => {
    try {
      await cacheService.close();
    } finally {
      await mongoClient.close();
    }
  };

  return {
    config,
    stripe,
    paymentService,
    storageService,
    usersService,
    cacheService,
    tiersService,
    licenseCodesService,
    objectStorageService,
    userFeaturesOverridesService,
    productsService,
    healthService,
    preCreatedUserService,
    confirmationTokenService,
    determineLifetimeConditions,
    invoiceCompletedHandler,
    closeConnections,
  };
}
