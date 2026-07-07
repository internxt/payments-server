import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getUser } from '../../fixtures';
import { MongoDBUsersRepository } from '../../../../src/core/users/MongoDBUsersRepository';

describe('User Repository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: MongoDBUsersRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    repository = new MongoDBUsersRepository(client);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collection = (repository as any).collection;
    await collection.deleteMany({});
  });

  describe('Update user', () => {
    test('When a top-level field is updated, then it is persisted', async () => {
      const mockedUser = getUser({ lifetime: false });
      await repository.insertUser(mockedUser);

      const updated = await repository.updateUser(mockedUser.customerId, { lifetime: true });

      const user = await repository.findUserByCustomerId(mockedUser.customerId);
      expect(updated).toBeTruthy();
      expect(user?.lifetime).toBeTruthy();
    });

    test('When a details field is updated, then it is persisted', async () => {
      const mockedUser = getUser();
      await repository.insertUser(mockedUser);
      const redeemedAt = new Date();

      const updated = await repository.updateUser(mockedUser.customerId, {
        details: { cancellationTrial: { redeemed: true, redeemedAt } },
      });

      const user = await repository.findUserByCustomerId(mockedUser.customerId);
      const cancellationTrial = user?.details?.cancellationTrial;
      expect(updated).toBeTruthy();
      expect(cancellationTrial?.redeemed).toBeTruthy();
      expect(cancellationTrial?.redeemedAt).toBeInstanceOf(Date);
    });

    test('When no user matches the customer id, then it returns false', async () => {
      const updated = await repository.updateUser('cus_nonexistent', { lifetime: true });

      expect(updated).toBeFalsy();
    });
  });
});
