import { Collection, MongoClient, WithId } from 'mongodb';
import { Tier } from './Tier';
import { User } from './User';

interface UserTier {
  id: string;
  userId: User['id'];
  tierId: Tier['id'];
}

export interface UsersTiersRepository {
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
