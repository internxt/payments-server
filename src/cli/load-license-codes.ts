import axios from 'axios';
import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { LicenseCodesService } from '../services/licenseCodes.service';
import { PaymentService } from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { UsersRepository } from '../core/users/UsersRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { MongoDBLicenseCodesRepository } from '../core/users/MongoDBLicenseCodesRepository';
import { LicenseCode } from '../core/users/LicenseCode';
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

const [, , filePath, provider] = process.argv;

if (!filePath || !provider) {
  throw new Error('Missing "filePath" or "provider" params');
}

function loadFromExcel(): LicenseCode[] {
  const licenseCodes: LicenseCode[] = [];

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  jsonData.forEach((_row) => {
    const row = _row as Record<Stripe.Price['id'], number>;

    for (const priceId of Object.keys(row)) {
      licenseCodes.push({
        code: row[priceId].toString(),
        priceId,
        provider: provider,
        redeemed: false,
      });
    }
  });

  return licenseCodes;
}

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(mongoClient);
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

    const licenseCodesService = new LicenseCodesService({
      paymentService,
      usersService,
      licenseCodesRepository,
    });

    for (const licenseCode of loadFromExcel()) {
      await licenseCodesService.insertLicenseCode(licenseCode);
    }
  } finally {
    await mongoClient.close();
  }
}

main()
  .then(() => {
    console.log('License codes loaded');
  })
  .catch((err) => {
    console.error('Error loading license codes', err.message);
  });
