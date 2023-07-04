import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { PriceMetadata } from '../services/PaymentService';
import { StorageService } from '../services/StorageService';
import { UsersService } from '../services/UsersService';

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  log: FastifyLoggerInstance,
): Promise<void> {
  const customerId = subscription.customer as string;
  const { uuid, lifetime } = await usersService.findUserByCustomerID(customerId);
  if (lifetime) {
    throw new Error('Lifetime user cannot purchase a subscription plan');
  }

  const bytesSpace =
    subscription.status === 'canceled'
      ? FREE_PLAN_BYTES_SPACE
      : parseInt((subscription.items.data[0].price.metadata as unknown as PriceMetadata).maxSpaceBytes);

  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleSubscriptionUpdated after trying to clear ${customerId} subscription`);
  }

  return storageService.changeStorage(uuid, bytesSpace);
}
