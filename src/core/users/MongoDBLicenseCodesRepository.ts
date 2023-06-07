import { Collection, MongoClient } from 'mongodb';
import { LicenseCode } from './LicenseCode';

import { LicenseCodesRepository } from './LicenseCodeRepository';

interface MongoLicenseCode extends Omit<LicenseCode, 'priceId'> {
  price_id: string;
}

export class MongoDBLicenseCodesRepository implements LicenseCodesRepository {
  private readonly collection: Collection<MongoLicenseCode>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<MongoLicenseCode>('license_codes');
  }

  async findOne(code: LicenseCode['code'], provider: LicenseCode['provider']): Promise<LicenseCode | null> {
    const licenseCode = await this.collection.findOne({
      code,
      provider,
    });

    if (licenseCode) {
      return this.toDomain(licenseCode);
    } else {
      return null;
    }
  }

  async insert(licenseCode: LicenseCode): Promise<void> {
    await this.collection.insertOne(this.toPersistence(licenseCode));
  }

  async updateByCode(code: LicenseCode['code'], body: Partial<Omit<LicenseCode, 'code'>>): Promise<boolean> {
    const result = await this.collection.updateOne({ code }, { $set: body });
    return result.matchedCount === 1;
  }

  private toDomain(licenseCode: MongoLicenseCode): LicenseCode {
    const { price_id: priceId, code, provider, redeemed } = licenseCode;

    return { priceId, code, provider, redeemed };
  }

  private toPersistence(licenseCode: LicenseCode): MongoLicenseCode {
    const { priceId: price_id, code, provider, redeemed } = licenseCode;

    return { price_id, code, provider, redeemed };
  }
}
