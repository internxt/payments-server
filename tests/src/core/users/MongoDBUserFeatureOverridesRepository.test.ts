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

  test('When the user does not have any custom feature, then nothing is returned', async () => {
    const result = await repository.findByUserUuid('non-existent-user-id');

    expect(result).toBeNull();
  });

  test('When the user does not exists in the collection, then a new one is created with the given custom features', async () => {
    const mockedUser = getUser();
    const mockOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userUuid: mockedUser.uuid,
      featuresPerService: {
        antivirus: { enabled: true },
        backups: { enabled: false },
      },
    };

    await repository.upsert(mockOverrides);

    const foundOverrides = await repository.findByUserUuid(mockedUser.uuid);

    expect(foundOverrides).toStrictEqual(mockOverrides);
  });

  test('When the user does exists in the collection, then the new features are added and the existing one should be kept', async () => {
    const mockedUser = getUser();
    const initialOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userUuid: mockedUser.uuid,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    };

    await repository.upsert(initialOverrides);

    const updatedOverrides: Omit<UserFeatureOverrides, 'id'> = {
      userUuid: mockedUser.uuid,
      featuresPerService: {
        backups: { enabled: true },
      },
    };

    await repository.upsert(updatedOverrides);

    const foundOverrides = await repository.findByUserUuid(mockedUser.uuid);

    expect(foundOverrides).toStrictEqual({
      userUuid: mockedUser.uuid,
      featuresPerService: {
        ...initialOverrides.featuresPerService,
        ...updatedOverrides.featuresPerService,
      },
    });
  });

  test('when updating user feature overrides multiple times, then it should keep merging features', async () => {
    const userUuid = getUser().uuid;

    await repository.upsert({
      userUuid,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    });

    await repository.upsert({
      userUuid,
      featuresPerService: {
        backups: { enabled: false },
      },
    });

    await repository.upsert({
      userUuid,
      featuresPerService: {
        antivirus: { enabled: false },
      },
    });

    const foundOverrides = await repository.findByUserUuid(userUuid);

    expect(foundOverrides?.featuresPerService).toStrictEqual({
      antivirus: { enabled: false },
      backups: { enabled: false },
    });
  });

  test('when updating the user features with an empty features, then it should not override existing features', async () => {
    const userUuid = getUser().uuid;

    const existingPayload = {
      userUuid,
      featuresPerService: {
        antivirus: { enabled: true },
      },
    };

    await repository.upsert(existingPayload);

    await repository.upsert({
      userUuid,
      featuresPerService: {},
    });

    const foundOverrides = await repository.findByUserUuid(userUuid);

    expect(foundOverrides).toStrictEqual(existingPayload);
  });
});
