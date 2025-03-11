import { FastifyBaseLogger } from 'fastify';
import { Service, Tier } from '../../core/users/Tier';
import { User } from '../../core/users/User';
import { createOrUpdateUser, updateUserTier } from '../../services/storage.service';
import { TiersService } from '../../services/tiers.service';
import config from '../../config';
import Stripe from 'stripe';
import { fetchUserStorage } from '../../utils/fetchUserStorage';

export class ExpandStorageNotAvailableError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, ExpandStorageNotAvailableError.prototype);
  }
}

interface HandleStackLifetimeStorageProps {
  logger: FastifyBaseLogger;
  user: User & { email: string };
  newTier: Tier;
  oldTier: Tier;
  tiersService: TiersService;
  customer: Stripe.Customer;
  subscriptionSeats: Stripe.InvoiceLineItem['quantity'];
}

export const handleStackLifetimeStorage = async ({
  logger,
  user,
  newTier,
  oldTier,
  tiersService,
  subscriptionSeats,
  customer,
}: HandleStackLifetimeStorageProps) => {
  const newTierId = newTier.id;
  const oldTierId = oldTier.id;
  const newTierSpaceInBytes = newTier.featuresPerService['drive'].maxSpaceBytes;
  const oldTierSpaceInBytes = oldTier.featuresPerService['drive'].maxSpaceBytes;

  logger.info(`The user has a lifetime. Checking if the user with uuid ${user.uuid} can stack more storage...`);
  const userStorage = await fetchUserStorage(user.uuid, user.email, newTierSpaceInBytes.toString());

  if (!userStorage.canExpand)
    throw new ExpandStorageNotAvailableError(`Expand storage not available for user with uuid: ${user.uuid}`);

  logger.info(
    `The user with uuid ${user.uuid} can stack more storage. Actual Storage for the user: ${userStorage.currentMaxSpaceBytes} / Storage to increase: ${newTierSpaceInBytes}`,
  );
  const totalSpaceBytes = userStorage.currentMaxSpaceBytes + newTierSpaceInBytes;
  const tierToUpdate = newTierSpaceInBytes > oldTierSpaceInBytes ? newTier.productId : oldTier.productId;

  await createOrUpdateUser(totalSpaceBytes.toString(), user.email, config);
  await updateUserTier(user.uuid, tierToUpdate, config);
  logger.info(`The user storage has been stacked. User uuid: ${user.uuid} / Total space bytes: ${totalSpaceBytes}`);

  if (newTierSpaceInBytes > oldTierSpaceInBytes) {
    logger.info(
      `Tier updated while stacking lifetime storage because the new one is highest than the old one. User Uuid: ${user.uuid} / tier Id: ${newTierId}`,
    );
    await tiersService.applyTier(user, customer, subscriptionSeats, newTier.productId, [Service.Drive]);

    if (oldTierId !== newTierId) {
      await tiersService.updateTierToUser(user.id, oldTierId, newTierId);
      logger.info(
        `Tier-User relationship updated while stacking lifetime storage. User uuid: ${user.uuid} / User Id: ${user.id} / new tier Id: ${newTierId}`,
      );
    }
  }
};
