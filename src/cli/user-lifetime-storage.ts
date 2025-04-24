import Stripe from 'stripe';
import { DetermineLifetimeConditions } from '../core/users/DetermineLifetimeConditions';
import { TiersService } from '../services/tiers.service';
import envVariablesConfig from '../config';
import { PaymentService } from '../services/payment.service';
import { ProductsRepository } from '../core/users/ProductsRepository';
import { MongoDBProductsRepository } from '../core/users/MongoDBProductsRepository';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { Bit2MeService } from '../services/bit2me.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { getUserStorage, StorageService } from '../services/storage.service';
import {
  DisplayBillingRepository,
  MongoDBDisplayBillingRepository,
} from '../core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../core/coupons/UsersCouponsRepository';
import { MongoDBCouponsRepository } from '../core/coupons/MongoDBCouponsRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import { MongoDBUsersCouponsRepository } from '../core/coupons/MongoDBUsersCouponsRepository';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { MongoDBTiersRepository, TiersRepository } from '../core/users/MongoDBTiersRepository';
import { MongoDBUsersTiersRepository, UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';
import { Tier } from '../core/users/Tier';
import CacheService from '../services/cache.service';

const startDate = Math.floor(new Date('2025-04-01T00:00:00Z').getTime() / 1000);
const endDate = Math.floor(new Date('2025-04-20T23:59:59Z').getTime() / 1000);

async function userLifetimeStorage() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);
    const tiersRepository: TiersRepository = new MongoDBTiersRepository(mongoClient);
    const usersTierRepository: UsersTiersRepository = new MongoDBUsersTiersRepository(mongoClient);
    const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
    const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
    const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
    const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);
    const bit2MeService: Bit2MeService = new Bit2MeService(envVariablesConfig, axios);
    const cacheService: CacheService = new CacheService(envVariablesConfig);

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
    const tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTierRepository,
      storageService,
      envVariablesConfig,
    );
    const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
    const report: {
      'Customer ID': string;
      'User UUID': string;
      Tier: Tier['productId'];
      'Max Space (Bytes)': number;
      'User Storage': number;
    }[] = [];

    const invoices = await stripe.invoices
      .list({
        created: {
          gte: startDate,
          lte: endDate,
        },
        status: 'paid',
        limit: 100,
      })
      .autoPagingToArray({ limit: 10000 });

    const filteredInvoices = invoices.filter((invoice) => {
      const hasValidProduct = invoice.lines.data.some((line) => {
        const product = line.price?.product;
        return typeof product === 'string' && line.price?.metadata.planType === 'one_time';
      });

      return invoice.customer && hasValidProduct && invoice.charge;
    });

    const seenUsers = new Set<string>();

    for (const invoice of filteredInvoices) {
      const user = await usersService.findUserByCustomerID(invoice.customer as string).catch((err) => {
        if (!(err instanceof UserNotFoundError)) {
          throw err;
        }

        return null;
      });

      if (!user) {
        console.log(`User with customer Id ${invoice.customer as string} has not found in our local DB`);
        continue;
      }

      if (seenUsers.has(user.uuid)) {
        continue;
      }
      seenUsers.add(user.uuid);

      const productId = invoice.lines.data[0].price?.product as string;
      const customer = await stripe.customers.retrieve(user.customerId);
      if (customer.deleted) return;

      let userStorage;

      try {
        userStorage = await getUserStorage(user.uuid, customer.email as string, '0', envVariablesConfig);
      } catch (error) {
        const err = error as Error;
        console.error(
          `The user with UUID: ${user.uuid} does not exist in Drive Server WIP. ERROR: ${err.stack ?? err.message}`,
        );
        continue;
      }

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(user, productId);

      if (maxSpaceBytes !== userStorage.currentMaxSpaceBytes) {
        report.push({
          'Customer ID': customer.id,
          'User UUID': user.uuid,
          Tier: tier.productId,
          'Max Space (Bytes)': maxSpaceBytes,
          'User Storage': userStorage.currentMaxSpaceBytes,
        });
      }
    }

    console.table(report);
    console.log(`✅ Filtered invoices: ${filteredInvoices.length}`);
    console.log(`✅ Total users: ${report.length}`);
  } finally {
    await mongoClient.close();
  }
}

userLifetimeStorage()
  .then(() => console.log('User tier applied'))
  .catch((err) => {
    console.error(`Error applying user tier and space: ${err.stack ?? err.message}`);
  });
