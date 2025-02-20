import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { CustomerId, PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';

export interface CreateOrUpdateTierFromUserProps {
  isBusinessPlan: boolean;
  productId: Stripe.Product['id'];
  user: User & { email: string };
  paymentService: PaymentService;
  customerId: CustomerId;
  tiersService: TiersService;
}

export async function createOrUpdateTierFromUser({
  customerId,
  isBusinessPlan,
  paymentService,
  tiersService,
  user,
  productId,
}: CreateOrUpdateTierFromUserProps): Promise<void> {
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const userId = user.id;
  const { id: newTierId } = await tiersService.getTierProductsByProductsId(productId);

  let existingTiersForUser = [];
  try {
    existingTiersForUser = await tiersService.getTiersProductsByUserId(userId);
  } catch (error) {
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    await tiersService.insertTierToUser(userId, newTierId);
    await tiersService.applyTier(user, productId);
    return;
  }

  const userInvoices = await paymentService.getDriveInvoices(customerId, {}, userType);
  const [, latestInvoice] = userInvoices;

  if (latestInvoice) {
    let oldTierId;
    const oldProductId = latestInvoice?.product as string;
    const existingTier = existingTiersForUser.find((existingUserTier) => existingUserTier.productId === oldProductId);

    if (!existingTier) return;

    oldTierId = existingTier.id;
    await tiersService.updateTierToUser(userId, oldTierId, newTierId);
    await tiersService.applyTier(user, productId);
  }
}
