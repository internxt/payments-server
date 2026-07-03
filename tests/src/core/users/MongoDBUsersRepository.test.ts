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

  describe('Redeem cancellation trial', () => {
    test('When the user redeems the cancellation trial, the correct values are inserted in the user document', async () => {
      const mockedUser = getUser();
      await repository.insertUser(mockedUser);
      await repository.redeemCancellationTrial(mockedUser.customerId);

      const user = await repository.findUserByCustomerId(mockedUser.customerId);
      const cancellationTrial = user?.details?.cancellationTrial;

      expect(cancellationTrial?.redeemed).toBeTruthy();
      expect(cancellationTrial?.redeemedAt).toBeInstanceOf(Date);
    });
  });

  describe('User has redeemed cancellation trial', () => {
    test('When the user has redeemed the cancellation trial, then it is indicated', async () => {
      const mockedUser = getUser();
      await repository.insertUser(mockedUser);
      await repository.redeemCancellationTrial(mockedUser.customerId);

      const hasRedeemedCancellationTrial = await repository.hasRedeemedCancellationTrial(mockedUser.customerId);

      expect(hasRedeemedCancellationTrial).toBeTruthy();
    });

    test('When the user has not redeemed the cancellation trial, then it is indicated', async () => {
      const mockedUser = getUser();
      await repository.insertUser(mockedUser);

      const hasRedeemedCancellationTrial = await repository.hasRedeemedCancellationTrial(mockedUser.customerId);

      expect(hasRedeemedCancellationTrial).toBeFalsy();
    });
  });
});
