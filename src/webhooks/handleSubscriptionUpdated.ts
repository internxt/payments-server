import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { PriceMetadata } from '../services/PaymentService';
import { StorageService, updateUserTier } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import { AppConfig } from '../config';

let stripe: Stripe;

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  log: FastifyLoggerInstance,
  config: AppConfig,
): Promise<void> {
  const customerId = subscription.customer as string;
  const { uuid, lifetime } = await usersService.findUserByCustomerID(customerId);
  if (lifetime) {
    return;
  }
  const isSubscriptionCanceled = subscription.status === 'canceled';

  const bytesSpace = isSubscriptionCanceled
    ? FREE_PLAN_BYTES_SPACE
    : parseInt((subscription.items.data[0].price.metadata as unknown as PriceMetadata).maxSpaceBytes);

  const planId = isSubscriptionCanceled ? FREE_INDIVIDUAL_TIER : (subscription.items.data[0].price.product as string);

  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleSubscriptionUpdated after trying to clear ${customerId} subscription`);
  }

  try {
    const userData = await usersService.findUserByUuid(uuid);
    const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);

    const promotionCodeId = invoice.discount?.promotion_code;

    if (promotionCodeId) {
      const promotionCodeName = await stripe.promotionCodes.retrieve(promotionCodeId as string);

      usersService.storeCouponUsedByUser(userData, promotionCodeName.code);
    }
  } catch (err) {
    log.error(`Error while adding user id and coupon id: ${err}`);
  }

  try {
    await updateUserTier(uuid, planId, config);
  } catch (err) {
    log.error(`Error while updating user tier: uuid: ${uuid} `);
    log.error(err);
    throw err;
  }

  return storageService.changeStorage(uuid, bytesSpace);
}
