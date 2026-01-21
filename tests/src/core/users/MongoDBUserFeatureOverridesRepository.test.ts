import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MongoDBUserFeatureOverridesRepository } from '../../../../src/core/users/MongoDBUserFeatureOverridesRepository';
import { UserFeatureOverrides } from '../../../../src/core/users/UserFeatureOverrides';
import { getUser } from '../../fixtures';

describe('User Features OVerrides Repository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: MongoDBUserFeatureOverridesRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    repository = new MongoDBUserFeatureOverridesRepository(client);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collection = (repository as any).collection;
    await collection.deleteMany({});
  });

  it('When the user does not have any custom feature, then nothing is returned', async () => {
    const result = await repository.findByUserId('non-existent-user-id');

    expect(result).toBeNull();
  });

  it('When the user does not exists in the collection, then a new one is created with the given custom features', async () => {
    const mockedUser = getUser();
    const mockOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userId: mockedUser.id,
      featuresPerService: {
        antivirus: { enabled: true },
        backups: { enabled: false },
      },
    };

    await repository.upsert(mockOverrides);

    const foundOverrides = await repository.findByUserId(mockedUser.id);

    expect(foundOverrides).toStrictEqual(mockOverrides);
  });

  it('When the user does exists in the collection, then the new features are added and the existing one should be kept', async () => {
    const mockedUser = getUser();
    const initialOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userId: mockedUser.id,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    };

    await repository.upsert(initialOverrides);

    const updatedOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userId: mockedUser.id,
      featuresPerService: {
        backups: { enabled: true },
      },
    };

    await repository.upsert(updatedOverrides);

    const foundOverrides = await repository.findByUserId(mockedUser.id);

    expect(foundOverrides).toStrictEqual({
      userId: mockedUser.id,
      featuresPerService: {
        ...initialOverrides.featuresPerService,
        ...updatedOverrides.featuresPerService,
      },
    });
  });

  it('when updating user feature overrides multiple times, then it should keep merging features', async () => {
    const userId = getUser().id;

    await repository.upsert({
      userId,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    });

    await repository.upsert({
      userId,
      featuresPerService: {
        backups: { enabled: false },
      },
    });

    await repository.upsert({
      userId,
      featuresPerService: {
        antivirus: { enabled: false },
      },
    });

    const foundOverrides = await repository.findByUserId(userId);

    expect(foundOverrides?.featuresPerService).toStrictEqual({
      antivirus: { enabled: false },
      backups: { enabled: false },
    });
  });

  it('when updating the user features with an empty features, then it should not override existing features', async () => {
    const userId = getUser().id;

    const existingPayload = {
      userId,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    };

    await repository.upsert(existingPayload);

    await repository.upsert({
      userId,
      featuresPerService: {},
    });

    const foundOverrides = await repository.findByUserId(userId);

    expect(foundOverrides).toStrictEqual(existingPayload);
  });
});
