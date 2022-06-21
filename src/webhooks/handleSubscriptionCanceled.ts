import { FastifyLoggerInstance } from 'fastify';
import { FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';

export default async function handleSubscriptionCanceled(
  storageService: StorageService,
  usersService: UsersService,
  customerId: string,
  cacheService: CacheService,
  log: FastifyLoggerInstance,
): Promise<void> {
  const { uuid } = await usersService.findUserByCustomerID(customerId);
  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleSubscriptionCanceled after trying to clear ${customerId} subscription`);
  }
  return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
}
