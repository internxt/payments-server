import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import Stripe from 'stripe';

import envVariablesConfig from '../config';
import { buildDependencies } from '../dependencies';
import { LicenseCode } from '../core/users/LicenseCode';

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
  const { licenseCodesService, closeConnections } = await buildDependencies({
    config: envVariablesConfig,
    mongoClient,
  });

  try {
    for (const licenseCode of loadFromExcel()) {
      await licenseCodesService.insertLicenseCode(licenseCode);
    }
  } finally {
    await closeConnections();
  }
}

main()
  .then(() => {
    console.log('License codes loaded');
  })
  .catch((err) => {
    console.error('Error loading license codes', err.message);
  });
