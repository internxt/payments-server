import Stripe from 'stripe';
import axios from 'axios';
import { MongoClient } from 'mongodb';

import { DetermineLifetimeConditions } from '../core/users/DetermineLifetimeConditions';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import envVariablesConfig from '../config';
import { PaymentService } from '../services/payment.service';
import { ProductsRepository } from '../core/users/ProductsRepository';
import { MongoDBProductsRepository } from '../core/users/MongoDBProductsRepository';
import { Bit2MeService } from '../services/bit2me.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { getUserStorage, StorageService, UserStorage } from '../services/storage.service';
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
import { Service, Tier } from '../core/users/Tier';
import CacheService from '../services/cache.service';

async function initializeStates() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
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

  return {
    mongoClient,
    cacheService,
    paymentService,
    tiersService,
    determineLifetimeConditions,
    usersService,
    storageService,
    stripe,
  };
}

const report: {
  'Customer ID': string;
  'User UUID': string;
  Tier: Tier['productId'];
  'Max Space (Bytes)': number;
  'User Storage': number;
}[] = [];
const fixedUsers = [{}];

const filteredInvoices = async (stripe: Stripe, startDate: number, endDate: number) => {
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

  return invoices.filter((invoice) => {
    const hasValidProduct = invoice.lines.data.some((line) => {
      const product = line.price?.product;
      return typeof product === 'string' && line.price?.metadata.planType === 'one_time';
    });

    return invoice.customer && hasValidProduct && invoice.charge;
  });
};

async function userLifetimeStorage(startDate: number, endDate: number) {
  const seenUsers = new Set<string>();
  const { cacheService, determineLifetimeConditions, mongoClient, storageService, usersService, stripe, tiersService } =
    await initializeStates();
  try {
    const invoices = await filteredInvoices(stripe, startDate, endDate);

    console.time('table-process');

    for (const invoice of invoices) {
      const user = await usersService.findUserByCustomerID(invoice.customer as string).catch((err) => {
        if (!(err instanceof UserNotFoundError)) {
          throw err;
        }

        return null;
      });

      if (!user) {
        console.warn(
          `[${invoice.id}] ⚠️ User with customer Id ${invoice.customer as string} has not found in our local DB. Skipping this user...`,
        );
        continue;
      } else if (!user?.lifetime) {
        console.warn(`[${invoice.id}] ⚠️ The user ${user.uuid} does not have a lifetime. Skipping this user...`);
        continue;
      }

      if (seenUsers.has(user.uuid)) {
        continue;
      }
      seenUsers.add(user.uuid);

      const productId = invoice.lines.data[0].price?.product as string;
      const tierExists = await tiersService.getTierProductsByProductsId(productId, 'lifetime').catch((err) => {
        if (err instanceof TierNotFoundError) {
          return null;
        }

        throw err;
      });

      if (!tierExists) {
        console.info(
          `[${invoice.id}] Product with id ${productId} is not a new product (does not have a tier). Skipping it...`,
        );
        continue;
      }

      const customer = await stripe.customers.retrieve(user.customerId);
      if (customer.deleted) return;

      let userStorage: UserStorage;

      try {
        userStorage = await getUserStorage(user.uuid, customer.email as string, '0', envVariablesConfig);
      } catch {
        console.error(
          `[${invoice.id}] The user with UUID: ${user.uuid} does not exist in Drive Server WIP. Skipping this user...`,
        );
        continue;
      }

      let userMaxSpaceBytes: number;
      let tier: Tier;

      try {
        const userTier = await determineLifetimeConditions.determine(user, productId);
        userMaxSpaceBytes = userTier.maxSpaceBytes;
        tier = userTier.tier;
      } catch {
        console.error(
          `[${invoice.id}] Something went wrong while determining the user lifetime conditions. Customer ID: ${customer.id}`,
        );
        continue;
      }

      if (!userMaxSpaceBytes && !tier) {
        console.log(`There are no max space bytes and tier for user ${user.customerId}. Skipping this user...`);
        continue;
      }

      if (userMaxSpaceBytes !== userStorage.currentMaxSpaceBytes) {
        let userTiers: Tier[] | null;

        userTiers = await tiersService.getTiersProductsByUserId(user.id).catch((err) => {
          if (!(err instanceof TierNotFoundError)) {
            console.error(`Something went wrong fetching the user tiers: ${err.message}`);
            throw err;
          }

          console.log(
            `[${invoice.id}] The user with customer ID ${user.customerId} does not have any individual active tier`,
          );
          return null;
        });

        const individualUserTier = userTiers?.find(
          (tier) => !tier.featuresPerService[Service.Drive].workspaces.enabled,
        );

        try {
          if (!individualUserTier) {
            await tiersService.insertTierToUser(user.id, tier.id);
          } else if (individualUserTier.id !== tier.id) {
            await tiersService.updateTierToUser(user.id, individualUserTier.id, tier.id);
          }
        } catch (error) {
          console.error(
            `[${invoice.id}] Error while inserting or updating the user-tier relationship. CUSTOMER ID: ${user.customerId} - PRODUCT ID (TIER): ${tier.productId}. ERROR: ${error.stack ?? error.message}`,
          );
          continue;
        }

        try {
          await storageService.changeStorage(user.uuid, userMaxSpaceBytes);
        } catch (error) {
          console.error(
            `[${invoice.id}] Error while updating the user storage. CUSTOMER ID: ${user.customerId}. ERROR: ${error.stack ?? error.message}`,
          );
          continue;
        }

        try {
          await tiersService.applyTier(
            {
              ...user,
              email: customer.email as string,
            },
            customer,
            1,
            productId,
            [Service.Drive],
          );
        } catch (error) {
          console.error(
            `[${invoice.id}] Error applying lifetime tier for user with customer ID ${user.customerId}:`,
            error,
          );
          continue;
        }

        try {
          await cacheService.clearSubscription(user.customerId);
        } catch {
          console.error(
            `[${invoice.id}] Error while clearing subscription cache for user with customer ID: ${user.customerId}`,
          );
        }

        console.log(`Changes applied for user with customer ID: ${user.customerId} and uuid: ${user.uuid}`);

        fixedUsers.push({
          uuid: user.uuid,
          customerId: user.customerId,
          email: customer.email,
        });
      }
    }

    console.log('✅ Tier applied for all these users:');
    console.table(fixedUsers);
    console.log(`✅ Filtered invoices: ${filteredInvoices.length}`);
    console.log(`✅ Total users: ${report.length}`);
  } finally {
    await mongoClient.close();
    console.timeEnd('table-process');
  }
}

const startDate = Math.floor(new Date('2025-03-13T00:00:00Z').getTime() / 1000);
const endDate = Math.floor(new Date().getTime() / 1000);

userLifetimeStorage(startDate, endDate)
  .then(() => {
    console.log('✅ User storage compared and updated if needed');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Error applying user tier and space: ${err.stack ?? err.message}`);
    process.exit(1);
  });
