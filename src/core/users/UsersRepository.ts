import { User } from '../../services/UsersService';

export interface UsersRepository {
  findUserByCustomerId(customerId: User['customerId']): Promise<User | null>;
  findUserByUuid(uuid: User['uuid']): Promise<User | null>;
}
