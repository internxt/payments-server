import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MongoDBTiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { Tier } from '../../../../src/core/users/Tier';
import { newTier } from '../../fixtures';

describe('Testing the tier collection', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: MongoDBTiersRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    client = new MongoClient(uri);
    await client.connect();

    repository = new MongoDBTiersRepository(client);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collection = (repository as any).collection;
    await collection.deleteMany({});
  });

  it('when a tier is searched by a non-existing productId, then it should return null', async () => {
    const result = await repository.findByProductId('non-existent');
    expect(result).toBeNull();
  });

  it('when a tier is searched by the product Id, then it should be found and match the inserted data', async () => {
    const collection = (repository as any).collection;
    const mockTier: Omit<Tier, 'id'> = newTier();
    const insertResult = await collection.insertOne(mockTier);

    const foundTier = await repository.findByProductId(mockTier.productId);

    expect(foundTier).not.toBeNull();
    expect(foundTier?.id).toBe(insertResult.insertedId.toString());
    expect(foundTier?.productId).toBe(mockTier.productId);
    expect(foundTier?.label).toBe(mockTier.label);
    expect(foundTier?.featuresPerService).toStrictEqual(mockTier.featuresPerService);
  });

  it('when a tier is searched by the product Id and billing type, then it should be found and match the inserted data', async () => {
    const collection = (repository as any).collection;
    const mockTier: Omit<Tier, 'id'> = newTier({ billingType: 'lifetime' });
    const insertResult = await collection.insertOne(mockTier);

    const foundTier = await repository.findByProductId(mockTier.productId, mockTier.billingType);

    expect(foundTier).not.toBeNull();
    expect(foundTier?.id).toBe(insertResult.insertedId.toString());
    expect(foundTier?.productId).toBe(mockTier.productId);
    expect(foundTier?.label).toBe(mockTier.label);
    expect(foundTier?.billingType).toBe(mockTier.billingType);
    expect(foundTier?.featuresPerService).toStrictEqual(mockTier.featuresPerService);
  });

  it('when a tier is searched by a non-existing id, then it should return null', async () => {
    const result = await repository.findByTierId('64b5b7fb69f1a8eb2ab4bad6');
    expect(result).toBeNull();
  });

  it('when a tier is searched by id, then it should be found and match the inserted data', async () => {
    const collection = (repository as any).collection;
    const mockTier: Omit<Tier, 'id'> = newTier();
    const insertResult = await collection.insertOne(mockTier);
    const insertedId = insertResult.insertedId.toString();

    const foundTier = await repository.findByTierId(insertedId);

    expect(foundTier).not.toBeNull();
    expect(foundTier?.id).toBe(insertedId);
    expect(foundTier?.productId).toBe(mockTier.productId);
    expect(foundTier?.label).toBe(mockTier.label);
    expect(foundTier?.featuresPerService).toStrictEqual(mockTier.featuresPerService);
  });
});
