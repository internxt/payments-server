import { Collection, MongoClient, ObjectId } from 'mongodb';
import { User, UserDetails } from './User';

import { UsersRepository } from './UsersRepository';
import dayjs from 'dayjs';

interface MongoUser extends Omit<User, 'customerId' | 'id'> {
  _id: ObjectId;
  customer_id: string;
}

export class MongoDBUsersRepository implements UsersRepository {
  private readonly collection: Collection<MongoUser>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<MongoUser>('users');
  }

  async updateUser(customerId: string, body: Pick<User, 'lifetime'>): Promise<boolean> {
    const result = await this.collection.updateOne({ customer_id: customerId }, { $set: body });
    return result.matchedCount === 1;
  }

  async findUserByCustomerId(customerId: string): Promise<User | null> {
    const user = await this.collection.findOne({ customer_id: customerId });

    if (user) {
      return this.mongoUserToUser(user);
    } else {
      return null;
    }
  }

  async findUserByUuid(uuid: string): Promise<User | null> {
    const user = await this.collection.findOne({ uuid });

    if (user) {
      return this.mongoUserToUser(user);
    } else {
      return null;
    }
  }

  async insertUser(user: Omit<User, 'id'>): Promise<void> {
    await this.collection.insertOne(this.userToMongoUser(user) as MongoUser);
  }

  async redeemCancellationTrial(customerId: User['customerId']): Promise<boolean> {
    const cancellationTrialKey: keyof UserDetails = 'cancellationTrial';
    const cancellationTrial: UserDetails['cancellationTrial'] = {
      redeemed: true,
      redeemedAt: dayjs().toDate(),
    };

    return this.updateUserDetails(customerId, cancellationTrialKey, cancellationTrial);
  }

  async hasRedeemedCancellationTrial(customerId: User['customerId']): Promise<boolean> {
    const user = await this.getUserDetails(customerId);
    return user?.cancellationTrial?.redeemed ?? false;
  }

  private async updateUserDetails(
    customerId: User['customerId'],
    detailsKey: keyof UserDetails,
    details: UserDetails[keyof UserDetails],
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { customer_id: customerId },
      { $set: { [`details.${detailsKey}`]: details } },
    );

    return result.matchedCount === 1;
  }

  private async getUserDetails(customerId: User['customerId']): Promise<UserDetails> {
    const user = await this.collection.findOne({ customer_id: customerId });
    return user?.details ?? {};
  }

  private mongoUserToUser(mongoUser: MongoUser): User {
    const { customer_id: customerId, uuid, lifetime, details } = mongoUser;

    return { customerId, uuid, lifetime, id: mongoUser._id.toString(), details };
  }

  private userToMongoUser(user: Omit<User, 'id'>): Omit<MongoUser, '_id'> {
    const { customerId: customer_id, uuid, lifetime } = user;

    return { customer_id, uuid, lifetime };
  }
}
