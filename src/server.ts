import axios from 'axios';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';
import { FastifyInstance } from 'fastify';

import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';
import envVariablesConfig from './config';
import { UsersRepository } from './core/users/UsersRepository';
import { MongoDBUsersRepository } from './core/users/MongoDBUsersRepository';
import CacheService from './services/CacheService';
import { buildApp } from './app';
import { LicenseCodesService } from './services/LicenseCodesService';
import { LicenseCodesRepository } from './core/users/LicenseCodeRepository';
import { MongoDBLicenseCodesRepository } from './core/users/MongoDBLicenseCodesRepository';

const start = async (): Promise<FastifyInstance> => {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
  const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(
    mongoClient
  );

  const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });
  const paymentService = new PaymentService(stripe);
  const storageService = new StorageService(envVariablesConfig, axios);
  const usersService = new UsersService(usersRepository, paymentService);
  const cacheService = new CacheService(envVariablesConfig);
  const licenseCodesService = new LicenseCodesService(
    paymentService,
    usersService,
    storageService,
    licenseCodesRepository
  );

  const fastify = await buildApp(
    paymentService,
    storageService,
    usersService,
    cacheService,
    licenseCodesService,
    stripe,
    envVariablesConfig,
  );

  try {
    const PORT = envVariablesConfig.SERVER_PORT;

    await fastify.listen(PORT, '0.0.0.0');
    return fastify;
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

export default start;
