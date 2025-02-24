import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { FastifyBaseLogger } from 'fastify';

export interface HandleUserFeaturesProps {
  purchasedItem: Stripe.InvoiceLineItem;
  user: { email: string; uuid: User['uuid'] };
  paymentService: PaymentService;
  customer: Stripe.Customer;
  tiersService: TiersService;
  logger: FastifyBaseLogger;
}

export const handleUserFeatures = async ({
  customer,
  purchasedItem,
  paymentService,
  tiersService,
  user,
  logger,
}: HandleUserFeaturesProps): Promise<void> => {
  const product = purchasedItem.price?.product as Stripe.Product;
  const isBusinessPlan = product.metadata.type === UserType.Business;
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const userId = user.uuid;
  const tier = await tiersService.getTierProductsByProductsId(product.id);
  const { id: newTierId } = tier;

  try {
    const existingTiersForUser = await tiersService.getTiersProductsByUserId(userId);
    const userInvoices = await paymentService.getDriveInvoices(customer.id, {}, userType);
    const [, latestInvoice] = userInvoices;

    logger.info({ invoiceId: latestInvoice?.id }, 'LATEST INVOICE ID');

    if (latestInvoice) {
      const oldProductId = latestInvoice?.product as string;
      const existingTier = existingTiersForUser.find((existingUserTier) => existingUserTier.productId === oldProductId);

      if (!existingTier)
        throw new InvoiceNotFoundError(
          `Latest invoice references product "${oldProductId}", but no matching tier was found for user ID "${userId}"`,
        );

      const oldTierId = existingTier.id;
      await tiersService.applyTier(user, customer, purchasedItem, product.id);
      await tiersService.updateTierToUser(userId, oldTierId, newTierId);
    }
  } catch (error) {
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }
    await tiersService.applyTier(user, customer, purchasedItem, product.id);
    await tiersService.insertTierToUser(userId, newTierId);
  }
};

export class InvoiceNotFoundError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, InvoiceNotFoundError.prototype);
  }
}
