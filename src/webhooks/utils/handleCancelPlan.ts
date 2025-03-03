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
}

export const handleCancelPlan = async ({
  customerId,
  customerEmail,
  productId,
  usersService,
  tiersService,
  log,
}: HandleCancelPlanProps) => {
  const user = await usersService.findUserByCustomerID(customerId);
  const { id: userId } = user;
  const tier = await tiersService.getTierProductsByProductsId(productId);

  log.info(`The user with id ${userId} exists, and the product with id ${tier.id} also exists.`);

  await usersService.updateUser(customerId, { lifetime: false });

  log.info(`THe user data for the customer ${userId} has been downgraded in handleCancelPlan`);

  await tiersService.removeTier({ ...user, email: customerEmail }, productId, log);

  log.info(`The tier for the user ${userId} has been removed`);

  await tiersService.deleteTierFromUser(userId, tier.id);

  log.info(`The user-tier relationship using the user id ${userId} and tier id ${tier.id} has been deleted`);
};
