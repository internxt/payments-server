import { MongoClient } from 'mongodb';

import envVariablesConfig from '../config';
import { buildDependencies } from '../dependencies';

const [, , customerId, lastPurchasedTierProductId] = process.argv;

async function main() {
  const mongoClient = await new MongoClient(envVariablesConfig.MONGO_URI).connect();
  const { usersService, determineLifetimeConditions, closeConnections } = await buildDependencies({
    config: envVariablesConfig,
    mongoClient,
  });

  try {
    const user = await usersService.findUserByCustomerID(customerId);
    const userLifetime = await determineLifetimeConditions.determine(user, lastPurchasedTierProductId);

    console.log(JSON.stringify(userLifetime));
  } finally {
    await closeConnections();
  }
}

main()
  .then(() => {
    console.log('User lifetime conditions determined');
  })
  .catch((err) => {
    console.error('Error determining user lifetime conditions', err.message);
  });
