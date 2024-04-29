import { Collection, MongoClient, ObjectId } from 'mongodb';
import { User } from './User';

import { UsersRepository } from './UsersRepository';

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

  private mongoUserToUser(mongoUser: MongoUser): User {
    const { customer_id: customerId, uuid, lifetime } = mongoUser;

    return { customerId, uuid, lifetime, id: mongoUser._id.toString() };
  }

  private userToMongoUser(user: Omit<User, 'id'>): Omit<MongoUser, '_id'> {
    const { customerId: customer_id, uuid, lifetime } = user;

    return { customer_id, uuid, lifetime };
  }
}
