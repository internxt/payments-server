import Stripe from 'stripe';
import fastifyCors from '@fastify/cors';
import Fastify, { FastifyInstance } from 'fastify';
import { AppConfig } from './config';
import controller from './controller/payments.controller';
import businessController from './controller/business.controller';
import productsController from './controller/products.controller';
import controllerMigration from './controller-migration';
import CacheService from './services/cache.service';
import { PaymentService } from './services/payment.service';
import { StorageService } from './services/storage.service';
import { UsersService } from './services/users.service';
import webhook from './webhooks';
import { LicenseCodesService } from './services/licenseCodes.service';
import { ObjectStorageService } from './services/objectStorage.service';
import { TiersService } from './services/tiers.service';

const envToLogger = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  production: true,
  test: false,
};

export async function buildApp(
  paymentService: PaymentService,
  storageService: StorageService,
  usersService: UsersService,
  cacheService: CacheService,
  tiersService: TiersService,
  licenseCodesService: LicenseCodesService,
  objectStorageService: ObjectStorageService,
  stripe: Stripe,
  config: AppConfig,
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: envToLogger[config.NODE_ENV] ?? true,
  });

  fastify.register(controller(paymentService, usersService, config, cacheService, licenseCodesService));
  fastify.register(businessController(paymentService, usersService, config), { prefix: '/business' });
  fastify.register(productsController(tiersService, usersService, config), { prefix: '/products' });
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
