import { CustomerId } from '../../services/payment.service';
import { UsersService } from '../../services/users.service';
import { TiersService } from '../../services/tiers.service';
import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';

interface HandleCancelPlanProps {
  customerId: CustomerId;
  customerEmail: string;
  productId: Stripe.Product['id'];
  usersService: UsersService;
  tiersService: TiersService;
  log: FastifyBaseLogger;
  isLifetime?: boolean;
}

export const handleCancelPlan = async ({
  customerId,
  customerEmail,
  productId,
  usersService,
  tiersService,
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

  await tiersService.deleteTierFromUser(userId, tier.id);

  log.info(
    `[CANCEL PLAN HANDLER]: The user-tier relationship using the user id ${userId} and tier id ${tier.id} has been deleted`,
  );
};
