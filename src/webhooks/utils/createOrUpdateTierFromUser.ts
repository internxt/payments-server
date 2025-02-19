import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { CustomerId, PaymentService } from '../../services/payment.service';
import { TiersService } from '../../services/tiers.service';
import { UsersService } from '../../services/users.service';

interface CreateOrUpdateTierFromUserProps {
  isBusinessPlan: boolean;
  productId: Stripe.Product['id'];
  usersService: UsersService;
  userUuid: User['uuid'];
  paymentService: PaymentService;
  customerId: CustomerId;
  tiersService: TiersService;
}

export async function createOrUpdateTierFromUser({
  customerId,
  isBusinessPlan,
  paymentService,
  tiersService,
  userUuid,
  usersService,
  productId,
}: CreateOrUpdateTierFromUserProps) {
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const userInvoices = await paymentService.getDriveInvoices(customerId, {}, userType);

  const { id: userId } = await usersService.findUserByUuid(userUuid);
  const { id: newTierId } = await tiersService.getTierProductsByProductsId(productId);

  if (userInvoices.length > 0) {
    const productId = userInvoices[0]?.product as string;
    const { id: oldTierId } = await tiersService.getTierProductsByProductsId(productId);
    await tiersService.updateTierToUser(userId, oldTierId, newTierId);
  } else {
    await tiersService.insertTierToUser(userId, newTierId);
  }
}
