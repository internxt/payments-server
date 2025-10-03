import axios from 'axios';
import { MongoClient } from 'mongodb';

import envVariablesConfig from '../config';
import { StorageService } from '../services/storage.service';
import { MongoDBUsersTiersRepository, UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';

const [, , subType] = process.argv;

const isBusiness = subType?.toLowerCase() === 'business';

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  try {
    const storageService = new StorageService(envVariablesConfig, axios);
    const usersTiersRepository: UsersTiersRepository = new MongoDBUsersTiersRepository(mongoClient);

    const userIdsAndForeignTierId = await usersTiersRepository.getUserTierMappings(isBusiness);

    for (const { userUuid, foreignTierId } of userIdsAndForeignTierId) {
      await storageService.updateUserStorageAndTier(userUuid, undefined, foreignTierId);
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
