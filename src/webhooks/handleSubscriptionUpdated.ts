import { FastifyBaseLogger, FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import CacheService from '../services/cache.service';
import { PaymentService } from '../services/payment.service';
import { StorageService } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { AppConfig } from '../config';
import { UserType } from '../core/users/User';
import { ObjectStorageService } from '../services/objectStorage.service';

function isObjectStorageProduct(meta: Stripe.Metadata): boolean {
  return !!meta && !!meta.type && meta.type === 'object-storage';
}

async function handleObjectStorageScheduledForCancelation(
  customer: Stripe.Customer,
  subscription: Stripe.Subscription,
  objectStorageService: ObjectStorageService,
  logger: FastifyLoggerInstance,
): Promise<void> {
  logger.info(`Deleting object storage customer ${customer.id} with sub ${subscription.id}`);

  await objectStorageService.deleteAccount({
    customerId: customer.id,
  });

  logger.info(`Object storage customer ${customer.id} with sub ${subscription.id} deleted successfully`);
}

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  paymentService: PaymentService,
  objectStorageService: ObjectStorageService,
  log: FastifyBaseLogger,
  config: AppConfig,
): Promise<void> {
  let uuid = '';
  const customerId = subscription.customer as string;
  const isSubscriptionCanceled = subscription.status === 'canceled';
  const subscriptionScheduledForCancelation =
    subscription.cancellation_details && subscription.cancellation_details.reason === 'cancellation_requested';
  const productId = subscription.items.data[0].price.product as string;
  const product = await paymentService.getProduct(productId);
  const { metadata: productMetadata } = product;

  if (isObjectStorageProduct(productMetadata)) {
    log.info(`Object storage customer ${customerId} with sub ${subscription.id} updated its sub`);

    if (isSubscriptionCanceled) {
      log.info(`Object storage customer ${customerId} with sub ${subscription.id} has been canceled`);
    } else if (subscriptionScheduledForCancelation) {
      log.info(`Object storage customer ${customerId} with sub ${subscription.id} has been scheduled for cancelation`);

      await handleObjectStorageScheduledForCancelation(
        (await paymentService.getCustomer(customerId)) as Stripe.Customer,
        subscription,
        objectStorageService,
        log,
      );
    }
    return;
  }

  try {
    const { uuid: userUuid, lifetime } = await usersService.findUserByCustomerID(customerId);
    uuid = userUuid;
    if (lifetime) {
      return;
    }
  } catch (error) {
    log.error(`Error in handleSubscriptionUpdated trying to fetch the customer by ID ${customerId}`);
    return;
  }

  const productType = productMetadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  try {
    await cacheService.clearSubscription(customerId, productType);
  } catch (err) {
    log.error(`Error in handleSubscriptionUpdated after trying to clear ${customerId} subscription`);
  }

  if (productType === UserType.Business) {
    if (isSubscriptionCanceled) {
      return usersService.destroyWorkspace(uuid);
    }
  }
}
