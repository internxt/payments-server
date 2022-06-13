import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from './config';
import controller from './controller';
import CacheService from './services/CacheService';
import { PaymentService } from './services/PaymentService';
import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import webhook from './webhooks';

export async function buildApp(
  paymentService: PaymentService,
  storageService: StorageService,
  usersService: UsersService,
  cacheService: CacheService,
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
  fastify.register(controller(paymentService, usersService, config, cacheService));

  fastify.register(webhook(stripe, storageService, usersService, paymentService, config, cacheService));

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
