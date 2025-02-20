import { UserType } from './../core/users/User';
import { FastifyBaseLogger, FastifyLoggerInstance } from 'fastify';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/cache.service';
import { StorageService, updateUserTier } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import { AppConfig } from '../config';
import Stripe from 'stripe';
import { ObjectStorageService } from '../services/objectStorage.service';

function isObjectStorageProduct(meta: Stripe.Metadata): boolean {
  return !!meta && !!meta.type && meta.type === 'object-storage';
}

async function handleObjectStorageSubscriptionCancelled(
  customer: Stripe.Customer,
  subscription: Stripe.Subscription,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  const activeSubscriptions = await paymentService.getActiveSubscriptions(customer.id);
  const objectStorageActiveSubscriptions = activeSubscriptions.filter(
    (s) => s.product?.metadata.type === 'object-storage',
  );

  if (objectStorageActiveSubscriptions.length > 0) {
    logger.info(
      `Preventing removal of an object storage customer ${customer.id} with sub ${subscription.id} due to the existence of another active subscription`,
    );
    return;
  }

  logger.info(`Deleting object storage customer ${customer.id} with sub ${subscription.id}`);

  await objectStorageService.deleteAccount({
    customerId: customer.id,
  });

  logger.info(`Object storage customer ${customer.id} with sub ${subscription.id} deleted successfully`);
}

export default async function handleSubscriptionCanceled(
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  objectStorageService: ObjectStorageService,
  log: FastifyBaseLogger,
  config: AppConfig,
): Promise<void> {
  const customerId = subscription.customer as string;
  const productId = subscription.items.data[0].price.product as string;
  const { metadata: productMetadata } = await paymentService.getProduct(productId);

  if (isObjectStorageProduct(productMetadata)) {
    await handleObjectStorageSubscriptionCancelled(
      (await paymentService.getCustomer(customerId)) as Stripe.Customer,
      subscription,
      objectStorageService,
      paymentService,
      log,
    );
    return;
  }

  const { uuid, lifetime: hasBoughtALifetime } = await usersService.findUserByCustomerID(customerId);

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
