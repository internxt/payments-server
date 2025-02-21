import { CustomerId } from '../../services/payment.service';
import { UsersService } from '../../services/users.service';
import { TiersService } from '../../services/tiers.service';
import Stripe from 'stripe';

interface HandleCancelPlanProps {
  customerId: CustomerId;
  customerEmail: string;
  productId: Stripe.Product['id'];
  usersService: UsersService;
  tiersService: TiersService;
}

export const handleCancelPlan = async ({
  customerId,
  customerEmail,
  productId,
  usersService,
  tiersService,
}: HandleCancelPlanProps) => {
  const user = await usersService.findUserByCustomerID(customerId);
  const { id: userId } = user;
  const tier = await tiersService.getTierProductsByProductsId(productId);

  await usersService.updateUser(customerId, { lifetime: false });

  await tiersService.removeTier({ ...user, email: customerEmail }, productId);
  await tiersService.deleteTierFromUser(userId, tier.id);
};
