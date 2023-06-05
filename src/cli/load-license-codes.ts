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

const [,,filePath,provider] = process.argv;

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
    const row = (_row as Record<Stripe.Price['id'], number>);

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
    const stripe = new Stripe(envVariablesConfig.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });
    const usersRepository: UsersRepository = new MongoDBUsersRepository(mongoClient);
    const storageService = new StorageService(envVariablesConfig, axios);
    const licenseCodesRepository: LicenseCodesRepository = new MongoDBLicenseCodesRepository(
      mongoClient
    );

    const paymentService = new PaymentService(stripe);
    const usersService = new UsersService(usersRepository, paymentService);
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

main().then(() => {
  console.log('License codes loaded');
}).catch((err) => {
  console.error('Error loading license codes', err.message);
});
