import Stripe from 'stripe';
import fastifyCors from '@fastify/cors';
import Fastify, { FastifyInstance } from 'fastify';
import { AppConfig } from './config';
import controller from './controller/payments.controller';
import objStorageController from './controller/object-storage.controller';
import businessController from './controller/business.controller';
import productsController from './controller/products.controller';
import checkoutController from './controller/checkout.controller';
import customerController from './controller/customer.controller';
import controllerMigration from './controller-migration';
import CacheService from './services/cache.service';
import { PaymentService } from './services/payment.service';
import { StorageService } from './services/storage.service';
import { UsersService } from './services/users.service';
import webhook from './webhooks';
import cryptoWebhook from './webhooks/providers/bit2me/index';
import { LicenseCodesService } from './services/licenseCodes.service';
import { ObjectStorageService } from './services/objectStorage.service';
import { TiersService } from './services/tiers.service';
import { ProductsService } from './services/products.service';
import Logger from './Logger';
import { registerErrorHandler } from './plugins/error-handler';

interface AppDependencies {
  paymentService: PaymentService;
  storageService: StorageService;
  usersService: UsersService;
  cacheService: CacheService;
  tiersService: TiersService;
  licenseCodesService: LicenseCodesService;
  objectStorageService: ObjectStorageService;
  productsService: ProductsService;
  stripe: Stripe;
  config: AppConfig;
}

export async function buildApp({
  paymentService,
  storageService,
  usersService,
  cacheService,
  tiersService,
  licenseCodesService,
  objectStorageService,
  productsService,
  stripe,
  config,
}: AppDependencies): Promise<FastifyInstance> {
  const fastify = Fastify({
    loggerInstance: Logger.getPinoLogger(),
  });

  registerErrorHandler(fastify);

  fastify.register(controller(paymentService, usersService, config, cacheService, licenseCodesService, tiersService));
  fastify.register(objStorageController(paymentService), { prefix: '/object-storage' });
  fastify.register(businessController(paymentService, usersService, config), { prefix: '/business' });
  fastify.register(productsController(tiersService, usersService, productsService, config), { prefix: '/products' });
  fastify.register(checkoutController(usersService, paymentService), { prefix: '/checkout' });
  fastify.register(customerController(usersService, paymentService, cacheService), { prefix: '/customer' });
  fastify.register(controllerMigration(paymentService, usersService, config));

  fastify.register(
    webhook(
      stripe,
      storageService,
      usersService,
      paymentService,
      config,
      cacheService,
      objectStorageService,
      tiersService,
    ),
  );

  fastify.register(
    cryptoWebhook({
      storageService,
      usersService,
      paymentService,
      config,
      cacheService,
      objectStorageService,
      tiersService,
    }),
  );

  fastify.register(fastifyCors, {
    allowedHeaders: [
      'sessionId',
      'Content-Type',
      'Authorization',
      'method',
      'internxt-version',
      'internxt-client',
      'internxt-mnemonic',
    ],
    exposedHeaders: ['sessionId'],
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
  });

  return fastify;
}
