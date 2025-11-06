import { Collection, MongoClient, WithId } from 'mongodb';
import { UserFeatureOverrides } from './UserFeatureOverrides';

export interface UserFeatureOverridesRepository {
  findByUserId(userId: string): Promise<UserFeatureOverrides | null>;
  upsert(userFeatureOverrides: Omit<UserFeatureOverrides, 'id'>): Promise<void>;
}

function toDomain(userFeatureOverrides: WithId<Omit<UserFeatureOverrides, 'id'>>): UserFeatureOverrides & {
  id: string;
} {
  const { _id, ...features } = userFeatureOverrides;

  return {
    ...features,
    id: _id.toString(),
  };
}

export class MongoDBUserFeatureOverridesRepository implements UserFeatureOverridesRepository {
  private readonly collection: Collection<UserFeatureOverrides>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<UserFeatureOverrides>('user_feature_overrides');
  }

  async findByUserId(userId: string): Promise<UserFeatureOverrides | null> {
    const userFeatureOverrides = await this.collection.findOne({ userId });

    return userFeatureOverrides ? toDomain(userFeatureOverrides) : null;
  }

  async upsert(userFeatureOverrides: Omit<UserFeatureOverrides, 'id'>): Promise<void> {
    await this.collection.updateOne(
      {
        userId: userFeatureOverrides.userId,
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
