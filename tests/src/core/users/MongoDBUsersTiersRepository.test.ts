import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MongoDBUsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { getUser, newTier } from '../../fixtures';

describe('Testing the users and tiers collection', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: MongoDBUsersTiersRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    repository = new MongoDBUsersTiersRepository(client);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collection = (repository as any).collection;
    await collection.deleteMany({});
  });

  it('when inserting a tier for a user, then it should be stored correctly', async () => {
    const { id: userId } = getUser();
    const { id: tierId } = newTier();

    await repository.insertTierToUser(userId, tierId);

    const userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(1);
    expect(userTiers[0].userId).toBe(userId);
    expect(userTiers[0].tierId).toBe(tierId);
    expect(userTiers[0].id).toBeDefined();
  });

  it('when finding multiple tiers for the same user, then it should return all assigned tiers', async () => {
    const { id: userId } = getUser();
    const { id: tierId1 } = newTier();
    const { id: tierId2 } = newTier();

    await repository.insertTierToUser(userId, tierId1);
    await repository.insertTierToUser(userId, tierId2);

    const userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(2);
    const tierIds = userTiers.map((ut) => ut.tierId);
    expect(tierIds).toContain(tierId1);
    expect(tierIds).toContain(tierId2);
  });

  it('when updating a user’s tier, then the tier should be updated successfully', async () => {
    const { id: userId } = getUser();
    const { id: oldTierId } = newTier();
    const { id: newTierId } = newTier();

    await repository.insertTierToUser(userId, oldTierId);
    const updated = await repository.updateUserTier(userId, oldTierId, newTierId);

    expect(updated).toBe(true);
    const userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(1);
    expect(userTiers[0].tierId).toBe(newTierId);
  });

  it('when trying to update a non-existing tier, then it should return false', async () => {
    const { id: userId } = getUser();
    const { id: oldTierId } = newTier();
    const { id: newTierId } = newTier();

    const updated = await repository.updateUserTier(userId, oldTierId, newTierId);
    expect(updated).toBe(false);
  });

  it('when deleting a tier from a user, then the tier should be removed successfully', async () => {
    const { id: userId } = getUser();
    const { id: tierId } = newTier();

    await repository.insertTierToUser(userId, tierId);
    const deleted = await repository.deleteTierFromUser(userId, tierId);

    expect(deleted).toBe(true);
    const userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(0);
  });

  it('when trying to delete a non-existing tier, then it should return false', async () => {
    const { id: userId } = getUser();
    const { id: tierId } = newTier();

    const deleted = await repository.deleteTierFromUser(userId, tierId);
    expect(deleted).toBe(false);
  });

  it('when deleting all tiers from a user, then all tiers should be removed', async () => {
    const { id: userId } = getUser();

    await repository.insertTierToUser(userId, 'tier1');
    await repository.insertTierToUser(userId, 'tier2');

    let userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(2);

    await repository.deleteAllUserTiers(userId);
    userTiers = await repository.findTierIdByUserId(userId);
    expect(userTiers).toHaveLength(0);
  });
});
