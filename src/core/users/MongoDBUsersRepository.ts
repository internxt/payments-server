import { Collection, MongoClient } from 'mongodb';
import { User } from './User';

import { UsersRepository } from './UsersRepository';

interface MongoUser extends Omit<User, 'customerId'> {
  customer_id: string;
}

export class MongoDBUsersRepository implements UsersRepository {
  private readonly collection: Collection<MongoUser>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<MongoUser>('users');
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

  async insertUser(user: User): Promise<void> {
    await this.collection.insertOne(this.userToMongoUser(user));
  }

  private mongoUserToUser(mongoUser: MongoUser): User {
    const { customer_id: customerId, uuid, lifetime } = mongoUser;

    return { customerId, uuid, lifetime };
  }

  private userToMongoUser(user: User): MongoUser {
    const { customerId: customer_id, uuid, lifetime } = user;

    return { customer_id, uuid, lifetime };
  }
}
