import { User } from './User';

export interface UsersRepository {
  findUserByCustomerId(customerId: User['customerId']): Promise<User | null>;
  findUserByUuid(uuid: User['uuid']): Promise<User | null>;
  insertUser(user: Omit<User, 'id'>): Promise<void>;
  updateUser(customerId: User['customerId'], body: Pick<User, 'lifetime'>): Promise<boolean>;
  upsertUser(customerId: User['customerId'], body: Omit<User, 'id'>): Promise<User | null>;
}
