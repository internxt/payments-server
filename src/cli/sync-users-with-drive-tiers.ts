import axios from 'axios';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { LicenseCodesService } from '../services/licenseCodes.service';
import { PaymentService } from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { MongoDBLicenseCodesRepository } from '../core/users/MongoDBLicenseCodesRepository';
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
import { TiersService } from '../services/tiers.service';
import { MongoDBTiersRepository, TiersRepository } from '../core/users/MongoDBTiersRepository';
import { MongoDBUsersTiersRepository, UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';

const [, , subType] = process.argv;

const isBusiness = subType?.toLowerCase() === 'business';

async function updateBusinessUsers(usersTiersRepository: UsersTiersRepository, usersService: UsersService) {
  const userIdsAndForeignTierId = await usersTiersRepository.getUserTierMappings(true);
  for (const { userUuid, foreignTierId } of userIdsAndForeignTierId) {
    await usersService.updateWorkspace({
      ownerId: userUuid,
      tierId: foreignTierId,
    });
  }
}

async function updatePersonalUsers(usersTiersRepository: UsersTiersRepository, storageService: StorageService) {
  const userIdsAndForeignTierId = await usersTiersRepository.getUserTierMappings(false);
  for (const { userUuid, foreignTierId } of userIdsAndForeignTierId) {
    await storageService.updateUserStorageAndTier(userUuid, undefined, foreignTierId);
  }
}

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);
    const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(mongoClient);
    const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
    const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
    const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
    const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);
    const tiersRepository: TiersRepository = new MongoDBTiersRepository(mongoClient);
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
    const tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      envVariablesConfig,
    );
    const licenseCodesService = new LicenseCodesService({
      paymentService,
      usersService,
      storageService,
      licenseCodesRepository,
      tiersService,
    });

    if (isBusiness) {
      await updateBusinessUsers(usersTiersRepository, usersService);
    } else {
      await updatePersonalUsers(usersTiersRepository, storageService);
    }
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
  });
