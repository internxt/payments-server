import { Collection, MongoClient, WithId } from 'mongodb';
import { Tier } from './Tier';
import { User } from './User';

export interface UserTier {
  id: string;
  userId: User['id'];
  tierId: Tier['id'];
}

export interface UsersTiersRepository {
  getUserTierMappings(isBusiness?: boolean): Promise<Array<{ userUuid: string; foreignTierId: string }>>;
  insertTierToUser(userId: User['id'], tierId: Tier['id']): Promise<void>;
  updateUserTier(userId: User['id'], oldTierId: Tier['id'], newTierId: Tier['id']): Promise<boolean>;
  deleteTierFromUser(userId: User['id'], tierId: Tier['id']): Promise<boolean>;
  deleteAllUserTiers(userId: User['id']): Promise<void>;
  findTierIdByUserId(userId: User['id']): Promise<UserTier[]>;
}

function toDomain(userTier: WithId<Omit<UserTier, 'id'>>): UserTier {
  return {
    ...userTier,
    id: userTier._id.toString(),
  };
}

export class MongoDBUsersTiersRepository implements UsersTiersRepository {
  private readonly collection: Collection<Omit<UserTier, 'id'>>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<Omit<UserTier, 'id'>>('users_tiers');
  }

  async getUserTierMappings(isBusiness = false): Promise<Array<{ userUuid: string; foreignTierId: string }>> {
    const results = await this.collection
      .aggregate([
        {
          $match: {
            'featuresPerService.drive.workspaces.enabled': isBusiness,
          },
        },
        {
          $addFields: {
            userIdObj: { $toObjectId: '$userId' },
            tierIdObj: { $toObjectId: '$tierId' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userIdObj',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: '$user',
        },
        {
          $lookup: {
            from: 'tiers',
            localField: 'tierIdObj',
            foreignField: '_id',
            as: 'tier',
          },
        },
        {
          $unwind: '$tier',
        },
        {
          $project: {
            _id: 0,
            userUuid: '$user.uuid',
            foreignTierId: '$tier.featuresPerService.drive.foreignTierId',
          },
        },
      ])
      .toArray();

    return results as Array<{ userUuid: string; foreignTierId: string }>;
  }

  async insertTierToUser(userId: User['id'], tierId: Tier['id']): Promise<void> {
    await this.collection.insertOne({
      userId,
      tierId,
    });
  }

  async findTierIdByUserId(userId: User['id']): Promise<UserTier[]> {
    const userTiers = await this.collection.find({ userId }).toArray();
    return userTiers.map(toDomain);
  }

  async updateUserTier(userId: User['id'], oldTierId: Tier['id'], newTierId: Tier['id']): Promise<boolean> {
    const result = await this.collection.updateOne({ userId, tierId: oldTierId }, { $set: { tierId: newTierId } });
    return result.modifiedCount > 0;
  }

  async deleteTierFromUser(userId: User['id'], tierId: Tier['id']): Promise<boolean> {
    const result = await this.collection.deleteOne({ userId, tierId });
    return result.deletedCount > 0;
  }

  async deleteAllUserTiers(userId: User['id']): Promise<void> {
    await this.collection.deleteMany({ userId });
  }
}
