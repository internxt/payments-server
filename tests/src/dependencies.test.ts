import { MongoClient } from 'mongodb';
import config from '../../src/config';
import { buildDependencies } from '../../src/dependencies';
import { StripePaymentsAdapter } from '../../src/infrastructure/adapters/stripe.adapter';
import CacheService from '../../src/services/cache.service';

const createMongoClient = () => {
  const collection = { findOne: jest.fn().mockResolvedValue(null) };
  return {
    db: () => ({ collection: () => collection }),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as MongoClient & { close: jest.Mock };
};

describe('Building the app dependencies', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('When the dependencies cannot be built, then the Mongo connection is closed and the error is thrown', async () => {
    const mongoClient = createMongoClient();
    const stripeError = new Error('Stripe is not reachable');
    jest.spyOn(StripePaymentsAdapter.prototype, 'syncTaxRegistrations').mockRejectedValue(stripeError);

    await expect(buildDependencies({ config, mongoClient })).rejects.toBe(stripeError);
    expect(mongoClient.close).toHaveBeenCalled();
  });

  test('When closing the connections and Redis fails to close, then Mongo is closed anyway', async () => {
    const mongoClient = createMongoClient();
    const redisError = new Error('Connection is closed');
    jest.spyOn(StripePaymentsAdapter.prototype, 'syncTaxRegistrations').mockResolvedValue();
    jest.spyOn(CacheService.prototype, 'close').mockRejectedValue(redisError);
    const { closeConnections } = await buildDependencies({ config, mongoClient });

    await expect(closeConnections()).rejects.toBe(redisError);
    expect(mongoClient.close).toHaveBeenCalled();
  });

  test('When closing the connections, then Redis and Mongo are closed', async () => {
    const mongoClient = createMongoClient();
    jest.spyOn(StripePaymentsAdapter.prototype, 'syncTaxRegistrations').mockResolvedValue();
    const closeRedis = jest.spyOn(CacheService.prototype, 'close').mockResolvedValue();
    const { closeConnections } = await buildDependencies({ config, mongoClient });

    await closeConnections();

    expect(closeRedis).toHaveBeenCalled();
    expect(mongoClient.close).toHaveBeenCalled();
  });
});
