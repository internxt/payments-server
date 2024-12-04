import { FastifyLoggerInstance } from 'fastify';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/cache.service';
import { StorageService, updateUserTier } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { AppConfig } from '../config';

export default async function handleLifetimeRefunded(
  storageService: StorageService,
  usersService: UsersService,
  customerId: string,
  cacheService: CacheService,
  log: FastifyLoggerInstance,
  config: AppConfig,
): Promise<void> {
  const { uuid } = await usersService.findUserByCustomerID(customerId);

  await usersService.updateUser(customerId, { lifetime: false });

  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleLifetimeRefunded after trying to clear ${customerId} subscription`);
  }
  try {
    await updateUserTier(uuid, FREE_INDIVIDUAL_TIER, config);
  } catch (err) {
    log.error(`Error while updating user tier: uuid: ${uuid} `);
    log.error(err);
    throw err;
  }

  return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
}
