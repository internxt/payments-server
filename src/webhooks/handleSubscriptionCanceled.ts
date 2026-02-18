import { UserType } from './../core/users/User';
import CacheService from '../services/cache.service';
import { StorageService } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import Stripe from 'stripe';
import { ObjectStorageService } from '../services/objectStorage.service';
import { handleCancelPlan } from './utils/handleCancelPlan';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { Service } from '../core/users/Tier';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { Customer } from '../infrastructure/domain/entities/customer';
import Logger from '../Logger';

function isObjectStorageProduct(meta: Stripe.Metadata): boolean {
  return !!meta && !!meta.type && meta.type === 'object-storage';
}

async function handleObjectStorageSubscriptionCancelled(
  customer: Customer,
  subscription: Stripe.Subscription,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
): Promise<void> {
  const activeSubscriptions = await paymentService.getActiveSubscriptions(customer.id);
  const objectStorageActiveSubscriptions = activeSubscriptions.filter(
    (s) => s.product?.metadata.type === 'object-storage',
  );

  if (objectStorageActiveSubscriptions.length > 0) {
    Logger.info(
      `Preventing removal of an object storage customer ${customer.id} with sub ${subscription.id} due to the existence of another active subscription`,
    );
    return;
  }

  Logger.info(`Deleting object storage customer ${customer.id} with sub ${subscription.id}`);

  await objectStorageService.deleteAccount({
    customerId: customer.id,
  });

  Logger.info(`Object storage customer ${customer.id} with sub ${subscription.id} deleted successfully`);
}

export default async function handleSubscriptionCanceled(
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  objectStorageService: ObjectStorageService,
  tiersService: TiersService,
): Promise<void> {
  const customerId = subscription.customer as string;
  const productId = subscription.items.data[0].price.product as string;
  const { metadata: productMetadata } = await paymentService.getProduct(productId);
  const customer = await stripePaymentsAdapter.getCustomer(customerId);

  if (isObjectStorageProduct(productMetadata)) {
    await handleObjectStorageSubscriptionCancelled(customer, subscription, objectStorageService, paymentService);
    return;
  }

  const { uuid, lifetime: hasBoughtALifetime } = await usersService.findUserByCustomerID(customerId);

  const productType = productMetadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  Logger.info(
    `[SUB CANCEL]: User with customerId ${customerId} found. The uuid of the user is: ${uuid} and productId: ${productId}`,
  );

  try {
    await cacheService.clearSubscription(customerId, productType);
    await cacheService.clearUsedUserPromoCodes(customerId);
    await cacheService.clearUserTier(uuid);
  } catch {
    Logger.error(`Error in handleSubscriptionCanceled after trying to clear ${customerId} subscription`);
  }

  if (hasBoughtALifetime && productType === UserType.Individual) {
    Logger.info(`User with uuid ${uuid} has a lifetime subscription. No need to downgrade the user.`);
    // This user has switched from a subscription to a lifetime, therefore we do not want to downgrade his space
    // The space should not be set to Free plan.
    return;
  }

  try {
    await handleCancelPlan({
      customerId,
      customerEmail: customer.email ?? '',
      productId,
      usersService,
      tiersService,
    });
  } catch (error) {
    const err = error as Error;
    Logger.error(`[SUB CANCEL/ERROR]: Error canceling tier product. ERROR: ${err.stack ?? err.message}`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    if (productType === UserType.Business) {
      await usersService.destroyWorkspace(uuid);
      return;
    }

    const freeTier = await tiersService.getTierProductsByProductsId('free');

    return storageService.updateUserStorageAndTier(
      uuid,
      freeTier.featuresPerService[Service.Drive].maxSpaceBytes,
      freeTier.featuresPerService[Service.Drive].foreignTierId,
    );
  }
}
