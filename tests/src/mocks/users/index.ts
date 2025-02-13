import { Chance } from 'chance';
import { randomUUID } from 'crypto';

const randomDataGenerator = new Chance();

export const getUser = (lifetime = false) => {
  const id = randomDataGenerator.string({ length: 12 });
  const uuid = randomUUID();
  const customerId = `cus_${randomDataGenerator.string({
    length: 10,
  })}`;

  return {
    id,
    uuid,
    customerId,
    lifetime,
  };
};
