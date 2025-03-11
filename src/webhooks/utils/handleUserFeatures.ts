import Stripe from 'stripe';
import { User, UserType } from '../../core/users/User';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { FastifyBaseLogger } from 'fastify';
import { UserNotFoundError, UsersService } from '../../services/users.service';
import { Service, Tier } from '../../core/users/Tier';
import { handleStackLifetimeStorage } from './handleStackLifetimeStorage';

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

  logger.info(`The Tier with Id ${newTierId} exists. It can be applied for user with uuid: ${user.uuid}`);

  try {
    const existingUser = await usersService.findUserByUuid(user.uuid);
    const isLifetimeStackTry = tier.billingType === 'lifetime' && existingUser.lifetime;

    const isLifetimePlan = isBusinessPlan ? existingUser.lifetime : isLifetimeCurrentSub;

    const existingTiersForUser = await tiersService.getTiersProductsByUserId(existingUser.id);
    const oldLifetimeTier = existingTiersForUser.find(
      (existingUserTier) => existingUserTier.billingType === 'lifetime',
    );

    if (isLifetimeStackTry && oldLifetimeTier) {
      logger.info(
        `User with uuid ${user.uuid} has a lifetime and purchased the tier with id ${newTierId}. Updating user and tier...`,
      );
      await handleStackLifetimeStorage({
        logger,
        newTier: tier,
        oldTier: oldLifetimeTier,
        user: { ...existingUser, email: user.email },
      });

      const newTierSpaceInBytes = tier.featuresPerService['drive'].maxSpaceBytes;
      const oldTierSpaceInBytes = oldLifetimeTier.featuresPerService['drive'].maxSpaceBytes;

      const tierToUpdate = newTierSpaceInBytes > oldTierSpaceInBytes ? tier.productId : oldLifetimeTier.productId;

      if (newTierSpaceInBytes > oldTierSpaceInBytes) {
        logger.info(
          `Tier updated while stacking lifetime storage because the new one is highest than the old one. User Uuid: ${user.uuid} / tier Id: ${newTierId}`,
        );
        await tiersService.applyTier(user, customer, purchasedItem.quantity, tierToUpdate, [Service.Drive]);

        if (oldLifetimeTier.id !== newTierId) {
          await tiersService.updateTierToUser(existingUser.id, oldLifetimeTier.id, newTierId);
          logger.info(
            `Tier-User relationship updated while stacking lifetime storage. User uuid: ${user.uuid} / User Id: ${user.id} / new tier Id: ${newTierId}`,
          );
        }
      }
      return;
    }

    const userInvoices = await paymentService.getDriveInvoices(customer.id, {}, userType);
    const [, latestInvoice] = userInvoices;
    if (userInvoices.length === 0 || !latestInvoice) {
      logger.error(
        `There are no invoices for this user, should be created -> customer id: ${customer.id}, tierId: ${tier.id}`,
      );
      throw new TierNotFoundError('Invoices with Tier not found');
    }

    const oldProductId = latestInvoice.product as string;
    const existingTier =
      existingTiersForUser.find((existingUserTier) => existingUserTier.productId === oldProductId) ?? oldLifetimeTier;

    if (!existingTier) {
      throw new InvoiceNotFoundError(
        `Latest invoice references product "${oldProductId}", but no matching tier was found for user ID "${existingUser.id}"`,
      );
    }

    const oldTierId = existingTier.id;

    await tiersService.applyTier(user, customer, purchasedItem.quantity, product.id);
    await usersService.updateUser(customer.id, {
      lifetime: isLifetimePlan,
    });

    if (oldTierId !== newTierId) {
      await tiersService.updateTierToUser(existingUser.id, oldTierId, newTierId);
    }
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      logger.warn(`UserNotFoundError -> Inserting user with uuid="${user.uuid}"`);

      await usersService.insertUser({
        customerId: customer.id,
        uuid: user.uuid,
        lifetime: isLifetimeCurrentSub,
      });

      const newUser = await usersService.findUserByUuid(user.uuid);

      await tiersService.applyTier(user, customer, purchasedItem.quantity, product.id);
      await tiersService.insertTierToUser(newUser.id, newTierId);

      return;
    } else if (error instanceof TierNotFoundError || error instanceof InvoiceNotFoundError) {
      logger.warn(`${error.constructor.name} -> Inserting new tier for user uuid="${user.uuid}"`);
      const existingUser = await usersService.findUserByUuid(user.uuid);
      const isLifetimeStackTry = tier.billingType === 'lifetime' && existingUser.lifetime;
      const excludedServices = isLifetimeStackTry ? [Service.Drive] : undefined;

      const isLifetimePlan = isBusinessPlan ? existingUser.lifetime : isLifetimeCurrentSub;

      if (isLifetimeStackTry) {
        logger.info(
          `User with uuid ${user.uuid} has a lifetime and purchased the tier with id ${newTierId}. Updating user and tier...`,
        );
        await handleStackLifetimeStorage({
          logger,
          newTier: tier,
          oldTier: tier,
          user: { ...existingUser, email: user.email },
        });
      }

      await tiersService.applyTier(user, customer, purchasedItem.quantity, product.id, excludedServices);
      await usersService.updateUser(customer.id, {
        lifetime: isLifetimePlan,
      });
      await tiersService.insertTierToUser(existingUser.id, newTierId);

      return;
    } else {
      throw error;
    }
  }
};
