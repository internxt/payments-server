import { Collection, MongoClient } from 'mongodb';

import { DynamicConfigEntry, DynamicConfigKey, DynamicConfigRepository } from './DynamicConfigRepository';
import Logger from '../../Logger';

export class MongoDBDynamicConfigRepository implements DynamicConfigRepository {
  private readonly collection: Collection<DynamicConfigEntry>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<DynamicConfigEntry>('dynamic_config');
  }

  async get(key: DynamicConfigKey): Promise<string | null> {
    const entry = await this.collection.findOne({ key });
    if (!!entry?.value) Logger.info(`[DYNAMIC CONFIG]: Value got from DB for ${key}`);

    return entry?.value ?? null;
  }
}
