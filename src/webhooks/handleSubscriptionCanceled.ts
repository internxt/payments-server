import { FREE_PLAN_BYTES_SPACE } from '../constants';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';

export default async function handleSubscriptionCanceled(
  storageService: StorageService,
  usersService: UsersService,
  customerId: string,
): Promise<void> {
  const { uuid } = await usersService.findUserByCustomerID(customerId);

  return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
}
