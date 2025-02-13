import { Chance } from 'chance';
import { randomUUID } from 'crypto';
import { User } from '../../src/core/users/User';

const randomDataGenerator = new Chance();

export const getUser = (params?: Partial<User>): User => {
  return {
    id: randomDataGenerator.string({ length: 12 }),
    uuid: randomUUID(),
    customerId: `cus_${randomDataGenerator.string({ length: 10 })}`,
    lifetime: false,
    ...params,
  };
};
