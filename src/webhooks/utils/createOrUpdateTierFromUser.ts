import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { CustomerId, PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
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
}: CreateOrUpdateTierFromUserProps): Promise<void> {
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const { id: userId } = await usersService.findUserByUuid(userUuid);
  const { id: newTierId } = await tiersService.getTierProductsByProductsId(productId);

  console.log('USER IN CREATE OR UPDATE TIER FROM USER');

  let existingTiersForUser = [];
  try {
    existingTiersForUser = await tiersService.getTiersProductsByUserId(userId);
    console.log('THERE ARE EXISTENT TIERS: ', existingTiersForUser);
  } catch (error) {
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    console.log('INSERT USER: ', userId, newTierId);

    await tiersService.insertTierToUser(userId, newTierId);
    return;
  }

  const userInvoices = await paymentService.getDriveInvoices(customerId, {}, userType);
  const [, latestInvoice] = userInvoices;

  if (latestInvoice) {
    let oldTierId;
    const productId = latestInvoice?.product as string;
    const existingTier = existingTiersForUser.find((existingUserTier) => existingUserTier.productId === productId);

    if (!existingTier) {
      await tiersService.insertTierToUser(userId, newTierId);
    }

    if (existingTier) {
      oldTierId = existingTier.id;
      console.log('UPDATING TIER TO USER: ', userId, oldTierId, newTierId);
      await tiersService.updateTierToUser(userId, oldTierId, newTierId);
    }
  }
}
