import { FastifyBaseLogger } from 'fastify';
import { Tier } from '../../core/users/Tier';
import { User } from '../../core/users/User';
import { createOrUpdateUser, updateUserTier } from '../../services/storage.service';
import config from '../../config';
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
}

export const handleStackLifetimeStorage = async ({
  logger,
  user,
  newTier,
  oldTier,
}: HandleStackLifetimeStorageProps) => {
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
  const tierToUpdate = newTierSpaceInBytes >= oldTierSpaceInBytes ? newTier.productId : oldTier.productId;

  await createOrUpdateUser(totalSpaceBytes.toString(), user.email, config);
  await updateUserTier(user.uuid, tierToUpdate, config);
  logger.info(`The user storage has been stacked. User uuid: ${user.uuid} / Total space bytes: ${totalSpaceBytes}`);
};
