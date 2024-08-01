import { UserType } from './../core/users/User';
import { FastifyLoggerInstance } from 'fastify';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { StorageService, updateUserTier } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import { PaymentService } from '../services/PaymentService';
import { AppConfig } from '../config';
import Stripe from 'stripe';

export default async function handleSubscriptionCanceled(
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  log: FastifyLoggerInstance,
  config: AppConfig,
): Promise<void> {
  const customerId = subscription.customer as string;
  const productId = subscription.items.data[0].price.product as string;
  const { uuid, lifetime: hasBoughtALifetime } = await usersService.findUserByCustomerID(customerId);

  const { metadata: productMetadata } = await paymentService.getProduct(productId);
  const productType = productMetadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  try {
    await cacheService.clearSubscription(customerId, productType);
  } catch (err) {
    log.error(`Error in handleSubscriptionCanceled after trying to clear ${customerId} subscription`);
  }

  if (productType === UserType.Business) {
    return usersService.destroyWorkspace(uuid);
  }

  if (hasBoughtALifetime) {
    // This user has switched from a subscription to a lifetime, therefore we do not want to downgrade his space
    // The space should not be set to Free plan.
    return;
  }

  try {
    await updateUserTier(uuid, FREE_INDIVIDUAL_TIER, config);
  } catch (err) {
    log.error(`[TIER/SUB_CANCELED] Error while updating user tier: uuid: ${uuid} `);
    log.error(err);
  }

  return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
}
