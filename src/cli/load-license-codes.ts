import axios from 'axios';
import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { LicenseCodesService } from '../services/LicenseCodesService';
import { PaymentService } from '../services/PaymentService';
import { UsersService } from '../services/UsersService';
import { UsersRepository } from '../core/users/UsersRepository';
import { MongoDBUsersRepository } from '../core/users/MongoDBUsersRepository';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { MongoDBLicenseCodesRepository } from '../core/users/MongoDBLicenseCodesRepository';
import { LicenseCode } from '../core/users/LicenseCode';
import { StorageService } from '../services/StorageService';
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
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);
    const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(mongoClient);
    const displayBillingRepository: DisplayBillingRepository = new MongoDBDisplayBillingRepository(mongoClient);
    const couponsRepository: CouponsRepository = new MongoDBCouponsRepository(mongoClient);
    const usersCouponsRepository: UsersCouponsRepository = new MongoDBUsersCouponsRepository(mongoClient);
    const productsRepository: ProductsRepository = new MongoDBProductsRepository(mongoClient);

    const paymentService = new PaymentService(stripe, productsRepository);
    const usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
      envVariablesConfig,
      axios,
    );
    const licenseCodesService = new LicenseCodesService(
      paymentService,
      usersService,
      storageService,
      licenseCodesRepository,
    );

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
