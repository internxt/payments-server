import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { PaymentService, PriceMetadata } from '../services/PaymentService';
import { findUserByEmail, StorageService, updateUserTier } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import { AppConfig } from '../config';
import { User, UserType } from '../core/users/User';

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,
  config: AppConfig,
): Promise<void> {
  const customerId = subscription.customer as string;
  const customer = await paymentService.getCustomer(customerId);
  if (customer.deleted) {
    log.error(
      `Customer object could not be retrieved in subscription updated handler with id ${subscription.id}`,
    );
    return;
  }

  let user: User | null = null;
  try {
    user = await usersService.findUserByCustomerID(customerId);
  } catch (err) {
    const email = customer.email;
    if (!email) {
      log.error(
        `Error searching for an user by email in subscription updated handler, email: ${email}`,
      );
      log.error(err);
      throw err;
    }

    const response = await findUserByEmail(email, config);
    try {
      user = await usersService.findUserByUuid(response.data.user.uuid);
    } catch {
      const price = subscription.items.data[0].price;
      await usersService.insertUser({
        customerId: customer.id,
        uuid: response.data.user.uuid,
        lifetime: (price.metadata as PriceMetadata).planType === 'one_time',
      });
      user = await usersService.findUserByUuid(response.data.user.uuid);
    }
  }
  
  if (!user || user.lifetime) {
    if (!user) {
      log.error(
        `Error searching for user in subscription updated handler, customer: ${customerId}`,
      );
    }
    return;
  }

  const isSubscriptionCanceled = subscription.status === 'canceled';

  const productId = subscription.items.data[0].price.product as string;
  const { metadata : productMetadata } = await paymentService.getProduct(productId);
  const productType = productMetadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  try {
    await cacheService.clearSubscription(customerId, productType);
  } catch (err) {
    log.error(`Error in handleSubscriptionUpdated after trying to clear ${customerId} subscription`);
  }

  if (productType === UserType.Business) {

    if (isSubscriptionCanceled) {
      return usersService.destroyWorkspace(user.uuid);
    }

    const customer = await paymentService.getCustomer(customerId);
    if (customer.deleted) {
      log.error(
        `Customer object could not be retrieved in subscription updated handler with id ${customer.id}`,
      );
      return;
    }
    const { maxSpaceBytes: priceMaxSpaceBytes } = subscription.items.data[0].price.metadata as PriceMetadata;
    const amountOfSeats = subscription.items.data[0]!.quantity!;

    const totalSpaceBytes = parseInt(priceMaxSpaceBytes) * amountOfSeats;
    return usersService.updateWorkspaceStorage(user.uuid, totalSpaceBytes);
  }

  const bytesSpace = isSubscriptionCanceled
    ? FREE_PLAN_BYTES_SPACE
    : parseInt((subscription.items.data[0].price.metadata as unknown as PriceMetadata).maxSpaceBytes);

  const planId = isSubscriptionCanceled ? FREE_INDIVIDUAL_TIER : productId;
  try {
    await updateUserTier(user.uuid, planId, config);
  } catch (err) {
    log.error(`Error while updating user tier: uuid: ${user.uuid} `);
    log.error(err);
    throw err;
  }

  return storageService.changeStorage(user.uuid, bytesSpace);
}
