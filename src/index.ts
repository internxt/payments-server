import axios from 'axios';
import Fastify from 'fastify';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';
import config from './config';
import webhook from './webhooks';
import controller from './controller';
import { UsersRepository } from './core/users/UsersRepository';
import { MongoDBUsersRepository } from './core/users/MongoDBUsersRepository';

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

const start = async () => {
  const mongoClient = await new MongoClient(config.MONGO_URI).connect();
  const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);

  const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });
  const paymentService = new PaymentService(stripe);
  const storageService = new StorageService(config, axios);
  const usersService = new UsersService(usersRepository, paymentService);

  fastify.register(controller(paymentService, usersService, config));

  fastify.register(webhook(stripe, storageService, usersService, config));

  try {
    const PORT = config.SERVER_PORT;

    await fastify.listen(PORT, '0.0.0.0');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
