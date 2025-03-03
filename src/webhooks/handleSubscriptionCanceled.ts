import { UserType } from './../core/users/User';
import { FastifyBaseLogger, FastifyLoggerInstance } from 'fastify';
import { FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/cache.service';
import { StorageService } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import { AppConfig } from '../config';
import Stripe from 'stripe';
import { ObjectStorageService } from '../services/objectStorage.service';
import { handleCancelPlan } from './utils/handleCancelPlan';
import { TierNotFoundError, TiersService } from '../services/tiers.service';

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
  tiersService: TiersService,
  log: FastifyBaseLogger,
  config: AppConfig,
): Promise<void> {
  let email: string | null = '';
  const customerId = subscription.customer as string;
  const productId = subscription.items.data[0].price.product as string;
  const { metadata: productMetadata } = await paymentService.getProduct(productId);
  const customer = await paymentService.getCustomer(customerId);

  if (!customer.deleted) {
    email = customer.email;
  }

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

  log.info(`User with customerId ${customerId} found. The uuid of the user is: ${uuid} and productId: ${productId}`);

  try {
    await cacheService.clearSubscription(customerId, productType);
  } catch (err) {
    log.error(`Error in handleSubscriptionCanceled after trying to clear ${customerId} subscription`);
  }

  if (hasBoughtALifetime) {
    // This user has switched from a subscription to a lifetime, therefore we do not want to downgrade his space
    // The space should not be set to Free plan.
    return;
  }

  try {
    await handleCancelPlan({
      customerId,
      customerEmail: email ?? '',
      productId,
      usersService,
      tiersService,
      log,
    });
  } catch (error) {
    const err = error as Error;
    log.error(`[SUB CANCEL/ERROR]: Error canceling tier product. ERROR: ${err.stack ?? err.message}`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
  }
}
