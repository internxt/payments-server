import { Service, Tier } from '../../../../core/users/Tier';
import { User } from '../../../../core/users/User';
import { TierNotFoundError, TiersService } from '../../../../services/tiers.service';
import { UsersService } from '../../../../services/users.service';

export async function upsertUserTierRelationship({
  productId,
  userUuid,
  billingType,
  isBusinessPlan,
  tiersService,
  usersService,
}: {
  billingType: Tier['billingType'];
  productId: string;
  userUuid: User['uuid'];
  isBusinessPlan: boolean;
  tiersService: TiersService;
  usersService: UsersService;
}) {
  const tier = await tiersService.getTierProductsByProductsId(productId, billingType);
  const existingUser = await usersService.findUserByUuid(userUuid);
  const userExistingTiers = await tiersService.getTiersProductsByUserId(existingUser.id);

  const tierToUpdate = isBusinessPlan
    ? userExistingTiers.find((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled)
    : userExistingTiers[0];

  if (!tierToUpdate) {
    throw new TierNotFoundError(`User with ID: ${userUuid} does not have any tier attached to him`);
  }

  try {
    await tiersService.updateTierToUser(existingUser.id, tierToUpdate.id, tier.id);
  } catch (error) {
    await tiersService.insertTierToUser(existingUser.id, tier.id);
  }
}
