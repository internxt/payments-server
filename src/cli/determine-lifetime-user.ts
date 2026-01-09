import axios from 'axios';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { PaymentService } from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import {
  DisplayBillingRepository,
  MongoDBDisplayBillingRepository,
} from '../core/users/MongoDBDisplayBillingRepository';
import { DetermineLifetimeConditions } from '../core/users/DetermineLifetimeConditions';
import { CouponsRepository } from '../core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../core/coupons/UsersCouponsRepository';
import { MongoDBCouponsRepository } from '../core/coupons/MongoDBCouponsRepository';
import { MongoDBUsersCouponsRepository } from '../core/coupons/MongoDBUsersCouponsRepository';
import { ProductsRepository } from '../core/users/ProductsRepository';
import { MongoDBProductsRepository } from '../core/users/MongoDBProductsRepository';
import { Bit2MeService } from '../services/bit2me.service';
import { TiersService } from '../services/tiers.service';
import { MongoDBTiersRepository } from '../core/users/MongoDBTiersRepository';
import { MongoDBUsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';
import { StorageService } from '../services/storage.service';

const [, , customerId, lastPurchasedTierProductId] = process.argv;

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
    const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
    const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
    const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);

    const bit2MeService = new Bit2MeService(
      envVariablesConfig,
      axios,
      envVariablesConfig.CRYPTO_PAYMENTS_PROCESSOR_SECRET_KEY,
      envVariablesConfig.CRYPTO_PAYMENTS_PROCESSOR_API_KEY,
      envVariablesConfig.CRYPTO_PAYMENTS_PROCESSOR_API_URL,
    );
    const paymentService = new PaymentService(stripe, productsRepository, bit2MeService);
    const usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
      envVariablesConfig,
      axios,
    );

    const tiersRepository = new MongoDBTiersRepository(mongoClient);
    const usersTiersRepository = new MongoDBUsersTiersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);

    const tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      envVariablesConfig,
    );

    const determineLifetimeUserCondition = new DetermineLifetimeConditions(paymentService, tiersService);
    const user = await usersService.findUserByCustomerID(customerId);

    const userLifetime = await determineLifetimeUserCondition.determine(user, lastPurchasedTierProductId);

    console.log(JSON.stringify(userLifetime));
  } finally {
    await mongoClient.close();
  }
}

main()
  .then(() => {
    console.log('User lifetime conditions determined');
  })
  .catch((err) => {
    console.error('Error determining user lifetime conditions', err.message);
  });
