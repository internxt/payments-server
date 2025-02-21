import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';

export interface HandleUserFeaturesProps {
  purchasedItem: Stripe.InvoiceLineItem;
  user: User & { email: string };
  paymentService: PaymentService;
  customer: Stripe.Customer;
  tiersService: TiersService;
}

export async function handleUserFeatures({
  customer,
  purchasedItem,
  paymentService,
  tiersService,
  user,
}: HandleUserFeaturesProps): Promise<void> {
  const product = purchasedItem.price?.product as Stripe.Product;
  const isBusinessPlan = product.metadata.type === UserType.Business;
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const userId = user.id;
  const { id: newTierId } = await tiersService.getTierProductsByProductsId(product.id);

  try {
    const existingTiersForUser = await tiersService.getTiersProductsByUserId(userId);
    const userInvoices = await paymentService.getDriveInvoices(customer.id, {}, userType);
    const [, latestInvoice] = userInvoices;

    if (latestInvoice) {
      let oldTierId;
      const oldProductId = latestInvoice?.product as string;
      const existingTier = existingTiersForUser.find((existingUserTier) => existingUserTier.productId === oldProductId);

      if (!existingTier) return;

      oldTierId = existingTier.id;
      await tiersService.updateTierToUser(userId, oldTierId, newTierId);
      await tiersService.applyTier(user, customer, purchasedItem, product.id);
    }
  } catch (error) {
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }
    await tiersService.insertTierToUser(userId, newTierId);
    await tiersService.applyTier(user, customer, purchasedItem, product.id);
  }
}
