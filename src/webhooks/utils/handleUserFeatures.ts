import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { FastifyBaseLogger } from 'fastify';
import { UserNotFoundError, UsersService } from '../../services/users.service';
import { Tier } from '../../core/users/Tier';

export interface HandleUserFeaturesProps {
  purchasedItem: Stripe.InvoiceLineItem;
  user: { email: string; uuid: User['uuid']; id?: User['id'] };
  paymentService: PaymentService;
  usersService: UsersService;
  customer: Stripe.Customer;
  tiersService: TiersService;
  isLifetimeCurrentSub?: boolean;
  logger: FastifyBaseLogger;
}

export class InvoiceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, InvoiceNotFoundError.prototype);
  }
}

export const handleUserFeatures = async ({
  customer,
  purchasedItem,
  usersService,
  isLifetimeCurrentSub,
  paymentService,
  tiersService,
  user,
  logger,
}: HandleUserFeaturesProps): Promise<void> => {
  const product = purchasedItem.price?.product as Stripe.Product;
  const isBusinessPlan = product.metadata.type === UserType.Business;
  const userType = isBusinessPlan ? UserType.Business : UserType.Individual;
  const tierBillingType: Tier['billingType'] = isLifetimeCurrentSub ? 'lifetime' : 'subscription';
  const tier = await tiersService.getTierProductsByProductsId(product.id, tierBillingType);
  const newTierId = tier.id;

  try {
    const existingUser = await usersService.findUserByUuid(user.uuid);

    const isLifetimePlan = isBusinessPlan ? existingUser.lifetime : isLifetimeCurrentSub;

    const existingTiersForUser = await tiersService.getTiersProductsByUserId(existingUser.id);
    const userInvoices = await paymentService.getDriveInvoices(customer.id, {}, userType);
    const [, latestInvoice] = userInvoices;
    if (userInvoices.length === 0 || !latestInvoice) {
      logger.error(
        `There are no invoices for this user, should be created -> customer id: ${customer.id}, tierId: ${tier.id}`,
      );
      throw new TierNotFoundError('Invoices with Tier not found');
    }

    if (latestInvoice) {
      const oldProductId = latestInvoice.product as string;
      const existingTier = existingTiersForUser.find((existingUserTier) => existingUserTier.productId === oldProductId);

      if (!existingTier) {
        throw new InvoiceNotFoundError(
          `Latest invoice references product "${oldProductId}", but no matching tier was found for user ID "${existingUser.id}"`,
        );
      }

      const oldTierId = existingTier.id;

      await tiersService.applyTier(user, customer, purchasedItem, product.id);
      await usersService.updateUser(customer.id, {
        lifetime: isLifetimePlan,
      });

      if (oldTierId !== newTierId) {
        await tiersService.updateTierToUser(existingUser.id, oldTierId, newTierId);
      }

      return;
    }
  } catch (error) {
    if (
      !(error instanceof TierNotFoundError) &&
      !(error instanceof UserNotFoundError) &&
      !(error instanceof InvoiceNotFoundError)
    ) {
      throw error;
    }

    if (error instanceof UserNotFoundError) {
      logger.warn(`UserNotFoundError -> Inserting user with uuid="${user.uuid}"`);

      await usersService.insertUser({
        customerId: customer.id,
        uuid: user.uuid,
        lifetime: isLifetimeCurrentSub,
      });

      const newUser = await usersService.findUserByUuid(user.uuid);

      await tiersService.applyTier(user, customer, purchasedItem, product.id);
      await tiersService.insertTierToUser(newUser.id, newTierId);

      return;
    }

    if (error instanceof TierNotFoundError || error instanceof InvoiceNotFoundError) {
      logger.warn(`TierNotFoundError -> Inserting new tier for user uuid="${user.uuid}"`);
      const existingUser = await usersService.findUserByUuid(user.uuid);

      const isLifetimePlan = isBusinessPlan ? existingUser.lifetime : isLifetimeCurrentSub;

      await tiersService.applyTier(user, customer, purchasedItem, product.id);
      await usersService.updateUser(customer.id, {
        lifetime: isLifetimePlan,
      });
      await tiersService.insertTierToUser(existingUser.id, newTierId);

      return;
    }
  }
};
