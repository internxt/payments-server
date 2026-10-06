import { CustomerId } from '../../types/stripe';
import { UsersService } from '../../services/users.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';
import { PreCreatedUserService } from '../../services/preCreatedUser.service';
import { PreCreatedUserStatus } from '../../infrastructure/domain/entities/preCreatedUser';
import { PreCreatedUserNotFoundError } from '../../errors/PreCreatedUsersErrors';

interface HandleCancelPlanProps {
  customerId: CustomerId;
  customerEmail: string;
  productId: Stripe.Product['id'];
  usersService: UsersService;
  tiersService: TiersService;
  preCreatedUserService: PreCreatedUserService;
  log: FastifyBaseLogger;
  isLifetime?: boolean;
}

export const handleCancelPlan = async ({
  customerId,
  customerEmail,
  productId,
  usersService,
  tiersService,
  preCreatedUserService,
  isLifetime,
  log,
}: HandleCancelPlanProps) => {
  const user = await usersService.findUserByCustomerID(customerId);
  const { id: userId } = user;
  const billingType = isLifetime ? 'lifetime' : 'subscription';
  const tier = await tiersService.getTierProductsByProductsId(productId, billingType);

  log.info(`[CANCEL PLAN HANDLER]: The user with id ${userId} exists, and the product with id ${tier.id} also exists.`);

  await usersService.updateUser(customerId, { lifetime: false });

  log.info(`[CANCEL PLAN HANDLER]: THe user data for the customer ${userId} has been downgraded in handleCancelPlan`);

  await tiersService.removeTier({ ...user, email: customerEmail }, productId, log);

  log.info(`[CANCEL PLAN HANDLER]: The tier for the user ${userId} has been removed`);

  const userTiers = await tiersService.getTiersProductsByUserId(user.id);

  const tierToRemove =
    userTiers.find(({ id }) => tier.id === id) ?? userTiers.find(({ billingType }) => billingType === 'lifetime');

  if (!tierToRemove) {
    throw new TierNotFoundError(`No tier found to remove for user ID: ${userId}`);
  }

  await tiersService.deleteTierFromUser(userId, tierToRemove.id);

  const preCreatedUser = await preCreatedUserService.get(customerEmail).catch((error) => {
    if (error instanceof PreCreatedUserNotFoundError) {
      return null;
    }

    throw error;
  });

  if (preCreatedUser) {
    await preCreatedUserService.update({
      uuid: preCreatedUser.uuid,
      status: PreCreatedUserStatus.Cancelled,
    });
  } else {
    log.info(`[CANCEL PLAN HANDLER]: The preCreatedUser with email ${customerEmail} does not exist. Continuing...`);
  }

  log.info(
    `[CANCEL PLAN HANDLER]: The user-tier relationship using the user id ${userId} and tier id ${tier.id} has been deleted`,
  );
};
