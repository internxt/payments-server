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
  const { uuid: userId } = user;
  const tier = await tiersService.getTierProductsByProductsId(productId);

  await usersService.updateUser(customerId, { lifetime: false });

  await tiersService.removeTier({ ...user, email: customerEmail }, productId, log);
  await tiersService.deleteTierFromUser(userId, tier.id);
};
