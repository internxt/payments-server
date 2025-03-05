import { FastifyBaseLogger } from 'fastify';
import { Tier } from '../../core/users/Tier';
import { User } from '../../core/users/User';
import { canUserStackStorage, createOrUpdateUser, updateUserTier } from '../../services/storage.service';
import { TiersService } from '../../services/tiers.service';
import config from '../../config';
import Stripe from 'stripe';

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
  const stackableLifetime = await canUserStackStorage(user.uuid, user.email, newTierSpaceInBytes.toString(), config);

  if (stackableLifetime.canExpand) {
    logger.info(
      `The user with uuid ${user.uuid} can stack more storage. Actual Storage for the user: ${stackableLifetime.currentMaxSpaceBytes} / Storage to increase: ${newTierSpaceInBytes}`,
    );
    const totalSpaceBytes = Number(stackableLifetime.currentMaxSpaceBytes.toString()) + newTierSpaceInBytes;

    if (newTierSpaceInBytes > oldTierSpaceInBytes) {
      logger.info(
        `Tier updated while stacking lifetime storage because the new one is highest than the old one. User Uuid: ${user.uuid} / tier Id: ${newTierId}`,
      );
      await tiersService.applyTier(user, customer, subscriptionSeats, newTier.productId);
    } else {
      await createOrUpdateUser(totalSpaceBytes.toString(), user.email, config);
      await updateUserTier(user.uuid, oldTier.productId, config);
      logger.info(`The user storage has been stacked. User uuid: ${user.uuid} / Total space bytes: ${totalSpaceBytes}`);
    }

    if (oldTierId !== newTierId) {
      await tiersService.updateTierToUser(user.id, oldTierId, newTierId);
      logger.info(
        `Tier-User relationship updated while stacking lifetime storage. User uuid: ${user.uuid} / User Id: ${user.id} / new tier Id: ${newTierId}`,
      );
    }
  }
};
