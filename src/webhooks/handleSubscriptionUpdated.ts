import Stripe from 'stripe';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';

type PriceMetadata = {
  maxSpaceBytes: string;
};

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;
  const { uuid } = await usersService.findUserByCustomerID(customerId);
  const bytesSpace = (subscription.items.data[0].price.metadata as unknown as PriceMetadata).maxSpaceBytes;

  return storageService.changeStorage(uuid, parseInt(bytesSpace));
}
