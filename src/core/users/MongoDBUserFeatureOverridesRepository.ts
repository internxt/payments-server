import { Collection, MongoClient, WithId } from 'mongodb';
import { UserFeatureOverrides } from './UserFeatureOverrides';

export interface UserFeatureOverridesRepository {
  findByUserUuid(userId: string): Promise<UserFeatureOverrides | null>;
  upsert(userFeatureOverrides: Omit<UserFeatureOverrides, 'id'>): Promise<void>;
}

function toDomain(userFeatureOverrides: WithId<Omit<UserFeatureOverrides, 'id'>>): UserFeatureOverrides {
  const { _id, ...features } = userFeatureOverrides;

  return features;
}

export class MongoDBUserFeatureOverridesRepository implements UserFeatureOverridesRepository {
  private readonly collection: Collection<UserFeatureOverrides>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<UserFeatureOverrides>('user_feature_overrides');
  }

  async findByUserUuid(userUuid: string): Promise<UserFeatureOverrides | null> {
    const userFeatureOverrides = await this.collection.findOne({ userUuid });

    return userFeatureOverrides ? toDomain(userFeatureOverrides) : null;
  }

  async upsert(userFeatureOverrides: Omit<UserFeatureOverrides, 'id'>): Promise<void> {
    await this.collection.updateOne(
      {
        userUuid: userFeatureOverrides.userUuid,
      },
      [
        {
          $set: {
            featuresPerService: {
              $mergeObjects: [{ $ifNull: ['$featuresPerService', {}] }, userFeatureOverrides.featuresPerService || {}],
            },
          },
        },
      ],
      {
        upsert: true,
      },
    );
  }
}
