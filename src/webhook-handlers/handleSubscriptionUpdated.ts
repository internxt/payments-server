import Stripe from 'stripe';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';

type PlanMetadata = {
  size_bytes: number;
};

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;
  const { uuid } = await usersService.findUserByCustomerID(customerId);

  const bytesSpace = (subscription.items.data[0].metadata as unknown as PlanMetadata).size_bytes;

  return storageService.changeStorage(uuid, bytesSpace);
}
