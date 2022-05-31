import { Collection, ObjectId, type MongoClient } from 'mongodb';

export type User = {
  customerId: string;
  uuid: string;
};

type MongoUser = {
  customer_id: string;
  uuid: string;
  _id: ObjectId;
};

export class UsersService {
  private readonly users: Collection<MongoUser>;

  constructor(mongo: MongoClient) {
    this.users = mongo.db().collection<MongoUser>('users');
  }

  async findUserByCustomerID(customerId: User['customerId']): Promise<User> {
    const userFound = await this.users.findOne({ customer_id: customerId });
    if (!userFound) {
      throw new UserNotFoundError();
    }

    return this.mongoUserToUser(userFound);
  }

  async findUserByUUID(uuid: User['uuid']): Promise<User> {
    const userFound = await this.users.findOne({ uuid });
    if (!userFound) {
      throw new UserNotFoundError();
    }

    return this.mongoUserToUser(userFound);
  }

  private mongoUserToUser(mongoUser: MongoUser): User {
    const { customer_id: customerId, uuid } = mongoUser;

    return { customerId, uuid };
  }
}

export class UserNotFoundError extends Error {}
