import axios from 'axios';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { PaymentService } from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import { StorageService } from '../services/storage.service';
import {
  DisplayBillingRepository,
  MongoDBDisplayBillingRepository,
} from '../core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../core/coupons/UsersCouponsRepository';
import { MongoDBCouponsRepository } from '../core/coupons/MongoDBCouponsRepository';
import { MongoDBUsersCouponsRepository } from '../core/coupons/MongoDBUsersCouponsRepository';
import { ProductsRepository } from '../core/users/ProductsRepository';
import { MongoDBProductsRepository } from '../core/users/MongoDBProductsRepository';
import { Bit2MeService } from '../services/bit2me.service';
import { MongoDBUsersTiersRepository, UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';

const [, , subType, userId] = process.argv;

const isBusiness = subType?.toLowerCase() === 'business';

export async function updateBusinessUsers(usersTiersRepository: UsersTiersRepository, usersService: UsersService) {
  const userIdsAndForeignTierId = await usersTiersRepository.getUserTierMappings(true, userId);
  const errors: Array<{ userUuid: string; error: string }> = [];

  for (const { userUuid, foreignTierId } of userIdsAndForeignTierId) {
    try {
      console.log(`Processing user: ${userUuid} with business foreign tier id: ${foreignTierId}`);
      await usersService.updateWorkspace({
        ownerId: userUuid,
        tierId: foreignTierId,
      });
      console.log(`Successfully updated user: ${userUuid}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to update user ${userUuid}: ${errorMessage}`);
      errors.push({ userUuid, error: errorMessage });
    }
  }

  if (errors.length > 0) {
    console.error(`\n=== SUMMARY: ${errors.length} user(s) failed ===`);
    errors.forEach(({ userUuid, error }) => {
      console.error(`  - ${userUuid}: ${error}`);
    });
  }

  return { total: userIdsAndForeignTierId.length, failed: errors.length, errors };
}

export async function updateIndividualUsers(
  usersTiersRepository: UsersTiersRepository,
  storageService: StorageService,
) {
  const userIdsAndForeignTierId = await usersTiersRepository.getUserTierMappings(false, userId);
  const errors: Array<{ userUuid: string; error: string }> = [];

  for (const { userUuid, foreignTierId } of userIdsAndForeignTierId) {
    try {
      console.log(`Processing user: ${userUuid} with individual foreign tier id: ${foreignTierId}`);
      await storageService.updateUserStorageAndTier(userUuid, undefined, foreignTierId);
      console.log(`Successfully updated user: ${userUuid}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to update user ${userUuid}: ${errorMessage}`);
      errors.push({ userUuid, error: errorMessage });
    }
  }

  if (errors.length > 0) {
    console.error(`\n=== SUMMARY: ${errors.length} user(s) failed ===`);
    errors.forEach(({ userUuid, error }) => {
      console.error(`  - ${userUuid}: ${error}`);
    });
  }

  return { total: userIdsAndForeignTierId.length, failed: errors.length, errors };
}

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);
    const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
    const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
    const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
    const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);
    const usersTiersRepository: UsersTiersRepository = new MongoDBUsersTiersRepository(mongoClient);
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

    let result;
    if (isBusiness) {
      result = await updateBusinessUsers(usersTiersRepository, usersService);
    } else {
      result = await updateIndividualUsers(usersTiersRepository, storageService);
    }

    console.log(`\n✓ Sync completed: ${result.total - result.failed}/${result.total} users updated successfully`);

    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    throw error;
  } finally {
    await mongoClient.close();
  }
}

main()
  .then(() => {
    console.log('Users and tiers synced');
  })
  .catch((err) => {
    console.error('Error while syncing users: ', err.message);
    process.exit(1);
  });
