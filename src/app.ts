import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from './config';
import controller from './controller';
import controllerMigration from './controller-migration';
import CacheService from './services/CacheService';
import { PaymentService } from './services/PaymentService';
import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import webhook from './webhooks';
import { LicenseCodesService } from './services/LicenseCodesService';
import { ObjectStorageService } from './services/ObjectStorageService';

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
  licenseCodesService: LicenseCodesService,
  objectStorageService: ObjectStorageService,
  stripe: Stripe,
  config: AppConfig,
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: envToLogger[config.NODE_ENV] ?? true,
  });
  fastify.register(controller(paymentService, usersService, config, cacheService, licenseCodesService));

  fastify.register(controllerMigration(paymentService, usersService, config));

  fastify.register(
    webhook(stripe, storageService, usersService, paymentService, config, cacheService, objectStorageService),
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
