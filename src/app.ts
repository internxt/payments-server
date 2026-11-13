import fastifyCors from '@fastify/cors';
import Fastify, { FastifyInstance } from 'fastify';
import { paymentsController } from './controller/payments.controller';
import { objectStorageController } from './controller/object-storage.controller';
import { businessController } from './controller/business.controller';
import { productsController } from './controller/products.controller';
import { checkoutController } from './controller/checkout.controller';
import { customerController } from './controller/customer.controller';
import { webhookHandler } from './webhooks';
import Logger from './Logger';
import { registerErrorHandler } from './plugins/error-handler';
import { gatewayController } from './controller/gateway.controller';
import healthController from './controller/health.controller';
import { type Dependencies } from './dependencies';

export async function buildApp({
  paymentService,
  storageService,
  usersService,
  cacheService,
  tiersService,
  licenseCodesService,
  objectStorageService,
  productsService,
  userFeaturesOverridesService,
  stripe,
  config,
  healthService,
  preCreatedUserService,
  confirmationTokenService,
}: Dependencies): Promise<FastifyInstance> {
  const fastify = Fastify({
    loggerInstance: Logger.getPinoLogger(),
  });

  registerErrorHandler(fastify);

  fastify.register(
    paymentsController(paymentService, usersService, config, cacheService, licenseCodesService, tiersService),
  );
  fastify.register(objectStorageController(paymentService), { prefix: '/object-storage' });
  fastify.register(businessController(paymentService, usersService, tiersService, config), { prefix: '/business' });
  fastify.register(productsController(productsService, cacheService, config), {
    prefix: '/products',
  });
  fastify.register(
    checkoutController({
      usersService,
      paymentsService: paymentService,
      preCreatedUserService,
      confirmationTokenService,
    }),
    {
      prefix: '/checkout',
    },
  );
  fastify.register(customerController(usersService, paymentService, cacheService), { prefix: '/customer' });
  fastify.register(
    gatewayController({
      usersService,
      userFeaturesOverridesService,
      cacheService,
      licenseCodeService: licenseCodesService,
      config,
    }),
    {
      prefix: '/gateway',
    },
  );
  fastify.register(healthController(healthService));

  fastify.register(
    webhookHandler({
      stripe,
      storageService,
      usersService,
      paymentService,
      config,
      cacheService,
      objectStorageService,
      tiersService,
      preCreatedUserService,
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
