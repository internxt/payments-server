import { Collection, MongoClient, ObjectId } from 'mongodb';

import { User } from '../../services/UsersService';
import { UsersRepository } from './UsersRepository';

interface MongoUser extends Omit<User, 'customerId'> {
  customer_id: string;
  _id: ObjectId;
}

export class MongoDBUsersRepository implements UsersRepository {
  private readonly collection: Collection<MongoUser>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db().collection<MongoUser>('users');
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

  private mongoUserToUser(mongoUser: MongoUser): User {
    const { customer_id: customerId, uuid } = mongoUser;

    return { customerId, uuid };
  }
}
