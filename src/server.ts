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
import {
  DisplayBillingRepository,
  MongoDBDisplayBillingRepository,
} from './core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from './core/coupons/CouponsRepository';
import { MongoDBCouponsRepository } from './core/coupons/MongoDBCouponsRepository';
import { UsersCouponsRepository } from './core/coupons/UsersCouponsRepository';
import { MongoDBUsersCouponsRepository } from './core/coupons/MongoDBUsersCouponsRepository';
import { ProductsRepository } from './core/users/ProductsRepository';
import { MongoDBProductsRepository } from './core/users/MongoDBProductsRepository';
import { ObjectStorageService } from './services/ObjectStorageService';

const start = async (): Promise<FastifyInstance> => {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
  const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(mongoClient);
  const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
  const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
  const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
  const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);

  const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  const paymentService = new PaymentService(stripe, productsRepository, usersRepository);
  const storageService = new StorageService(envVariablesConfig, axios);
  const usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    envVariablesConfig,
    axios,
  );
  const cacheService = new CacheService(envVariablesConfig);
  const licenseCodesService = new LicenseCodesService(
    paymentService,
    usersService,
    storageService,
    licenseCodesRepository,
  );
  const objectStorageService = new ObjectStorageService(paymentService, envVariablesConfig, axios);
  const fastify = await buildApp(
    paymentService,
    storageService,
    usersService,
    cacheService,
    licenseCodesService,
    objectStorageService,
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
