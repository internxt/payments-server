import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { loadConfig } from '../../src/config';
import { buildDependencies } from '../../src/dependencies';
import { StripeAdapter } from '../../src/infrastructure/adapters/stripe.adapter';
import CacheService from '../../src/services/cache.service';

const config = loadConfig();

describe('Building the app dependencies', () => {
  let mongoServer: MongoMemoryServer;
  let appConfig: typeof config;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    appConfig = { ...config, MONGO_URI: mongoServer.getUri() };
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('When the Stripe tax registrations cannot be loaded, then the Mongo connection is closed and the error is thrown', async () => {
    const stripeError = new Error('Stripe is not reachable');
    jest.spyOn(StripeAdapter.prototype, 'syncTaxRegistrations').mockRejectedValue(stripeError);
    const closeMongo = jest.spyOn(MongoClient.prototype, 'close');

    await expect(buildDependencies(appConfig)).rejects.toBe(stripeError);
    expect(closeMongo).toHaveBeenCalled();
  });

  test('When closing the connections, then Redis and Mongo are closed', async () => {
    jest.spyOn(StripeAdapter.prototype, 'syncTaxRegistrations').mockResolvedValue();
    const closeRedis = jest.spyOn(CacheService.prototype, 'close');
    const closeMongo = jest.spyOn(MongoClient.prototype, 'close');
    const { closeConnections } = await buildDependencies(appConfig);

    await closeConnections();

    expect(closeRedis).toHaveBeenCalled();
    expect(closeMongo).toHaveBeenCalled();
  });
});
