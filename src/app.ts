import fastifyCors from '@fastify/cors';
import Fastify, { FastifyInstance } from 'fastify';
import { paymentsController } from './controller/payments.controller';
import { objectStorageController } from './controller/object-storage.controller';
import { businessController } from './controller/business.controller';
import { productsController } from './controller/products.controller';
import { checkoutController } from './controller/checkout.controller';
import { customerController } from './controller/customer.controller';
import { gatewayController } from './controller/gateway.controller';
import healthController from './controller/health.controller';
import { webhookHandler } from './webhooks';
import Logger from './Logger';
import { registerErrorHandler } from './plugins/error-handler';
import { type Dependencies } from './dependencies';

export async function buildApp(deps: Dependencies): Promise<FastifyInstance> {
  const fastify = Fastify({
    loggerInstance: Logger.getPinoLogger(),
  });

  registerErrorHandler(fastify);

  fastify.register(paymentsController(deps));
  fastify.register(objectStorageController(deps), { prefix: '/object-storage' });
  fastify.register(businessController(deps), { prefix: '/business' });
  fastify.register(productsController(deps), { prefix: '/products' });
  fastify.register(checkoutController(deps), { prefix: '/checkout' });
  fastify.register(customerController(deps), { prefix: '/customer' });
  fastify.register(gatewayController(deps), { prefix: '/gateway' });
  fastify.register(healthController(deps));
  fastify.register(webhookHandler(deps));

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
