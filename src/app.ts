import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from './config';
import controller from './controller/payments.controller';
import businessController from './controller/business.controller';
import controllerMigration from './controller-migration';
import CacheService from './services/cache.service';
import { PaymentService } from './services/payment.service';
import { StorageService } from './services/storage.service';
import { UsersService } from './services/users.service';
import webhook from './webhooks';
import { LicenseCodesService } from './services/licenseCodes.service';
import { ObjectStorageService } from './services/objectStorage.service';
import fastifyJwt from '@fastify/jwt';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rateLimit = require('fastify-rate-limit');

type AllowedMethods = 'GET' | 'POST';

const allowedRoutes: {
  [key: string]: AllowedMethods[];
} = {
  '/prices': ['GET'],
  '/is-unique-code-available': ['GET'],
  '/plan-by-id': ['GET'],
  '/promo-code-by-name': ['GET'],
  '/promo-code-info': ['GET'],
  '/object-storage-plan-by-id': ['GET'],
  '/create-customer-for-object-storage': ['POST'],
  '/payment-intent-for-object-storage': ['GET'],
  '/create-subscription-for-object-storage': ['POST'],
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
    logger: {
      prettyPrint:
        config.NODE_ENV === 'development'
          ? {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            }
          : false,
    },
  });

  fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
  fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const config: { url?: string; method?: string } = request.context.config;
      const allowedRoutes: Record<string, string[]> = {};

      if (
        config.method &&
        config.url &&
        allowedRoutes[config.url] &&
        allowedRoutes[config.url].includes(config.method)
      ) {
        return;
      }
      await request.jwtVerify();
    } catch (err) {
      request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
      reply.status(401).send();
    }
  });

  fastify.register(controller(paymentService, usersService, config, cacheService, licenseCodesService));

  fastify.register(businessController(paymentService, usersService, config), {
    prefix: '/business',
  });

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
