import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import { PaymentService, PriceMetadata } from '../../../services/payment.service';
import { User } from '../../../core/users/User';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { UserNotFoundError, UsersService } from '../../../services/users.service';
import { TierNotFoundError, TiersService } from '../../../services/tiers.service';
import { fetchUserStorage } from '../../../utils/fetchUserStorage';
import { ExpandStorageNotAvailableError } from '../../utils/handleStackLifetimeStorage';
import CacheService from '../../../services/cache.service';
import { handleOldInvoiceCompletedFlow } from '../../utils/handleOldInvoiceCompletedFlow';
import config from '../../../config';
import { StorageService } from '../../../services/storage.service';
import { Service, Tier } from '../../../core/users/Tier';
import { handleObjectStorageInvoiceCompleted } from '../../utils/handleObjStorageInvoiceCompleted';
import { buildInvoiceContext, InvoiceContext } from './utils/buildInvoiceContext';
import { storeCouponUsedByUser } from './utils/storeCouponUsedByUser';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';

interface HandleInvoiceCompletedProps {
  session: Stripe.Invoice;
  paymentService: PaymentService;
  objectStorageService: ObjectStorageService;
  tiersService: TiersService;
  storageService: StorageService;
  usersService: UsersService;
  cacheService: CacheService;
  logger: FastifyBaseLogger;
}

async function getStackedSpace(user: { uuid: User['uuid']; email: string }, productStorageSpace: number) {
  const userStorage = await fetchUserStorage(user.uuid, user.email, productStorageSpace.toString());

  if (!userStorage.canExpand)
    throw new ExpandStorageNotAvailableError(`Expand storage not available for user with uuid: ${user.uuid}`);

  return userStorage.currentMaxSpaceBytes + productStorageSpace;
}

export async function handleInvoiceCompleted({
  session,
  objectStorageService,
  paymentService,
  tiersService,
  storageService,
  usersService,
  cacheService,
  logger,
}: HandleInvoiceCompletedProps) {
  // 1. Check if the invoice is paid (status = paid)
  if (session.status !== 'paid') {
    logger.error(`[${session.id}] The invoice has not paid successfully, processed without action`);
    return;
  }

  let ctx: InvoiceContext;
  try {
    ctx = await buildInvoiceContext(session, {
      logger,
      paymentService,
    });
  } catch (err) {
    logger.error(err, 'InvoiceContext error');
    throw err;
  }

  const {
    billingType,
    customer,
    customerEmail,
    customerId,
    invoiceId,
    isBusinessPlan,
    isLifetime,
    isObjectStoragePlan,
    price,
    product,
    seats,
    lineItems,
  } = ctx;

  if (customer.deleted) {
    logger.error(
      `[${session.id}] Customer ${customerId} from invoice ${invoiceId} does not exist or has been deleted.`,
    );
    return;
  }

  if (!price) {
    logger.error(
      `[${session.id}] Invoice completed with id ${invoiceId} does not contain price, customer: ${session.customer_email}`,
    );
    return;
  }

  const { maxSpaceBytes } = price.metadata as PriceMetadata;
  const amountOfSeats = seats;
  let user: { uuid: string };

  // Handle object storage case
  if (isObjectStoragePlan) {
    await handleObjectStorageInvoiceCompleted(customer, session, objectStorageService, paymentService, logger);
    return;
  }

  // Get customer UUID
  try {
    user = await usersService.findUserByCustomerID(customer.id);
  } catch (err) {
    if (customerEmail) {
      const response = await usersService.findUserByEmail(customerEmail.toLowerCase());
      user = response.data;
    } else {
      logger.error(
        `[${session.id}] Error searching for an user by email in checkout session completed handler, email: ${customerEmail}. ERROR: ${err}`,
      );
      throw err;
    }
  }

  // Insert or update user in Users collection
  const existingUser = await usersService.findUserByUuid(user.uuid).catch(() => null);

  const lifetime = isBusinessPlan && existingUser ? existingUser.lifetime : isLifetime;

  const localUser = await usersService.upsertUserByUuid(user.uuid, {
    customerId: customer.id,
    uuid: user.uuid,
    lifetime,
  });

  // 9a. Apply tier
  // Apply tier
  let tier: Tier | null = null;
  let userStackedStorage: number | undefined;

  try {
    const existingUser = await usersService.findUserByUuid(user.uuid).catch(() => {
      return null;
    });

    if (!existingUser) throw new UserNotFoundError(`User with ID: ${user.uuid} has not found in the local DB`);

    if (isLifetime) {
      const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
      const result = await determineLifetimeConditions.determine(existingUser, product.id);
      userStackedStorage = result.maxSpaceBytes;
      tier = result.tier;
    } else {
      tier = await tiersService.getTierProductsByProductsId(product.id, billingType);
    }

    if (userStackedStorage && tier) {
      tier.featuresPerService[Service.Drive].maxSpaceBytes = userStackedStorage;
    }

    await tiersService.applyTier({ uuid: user.uuid, email: customerEmail }, customer, amountOfSeats, tier);
  } catch (error) {
    const err = error as Error;
    logger.error(`[${session.id}] Error in tier logic: ${err.stack ?? err.message}`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    logger.info('Using the old flow to insert the user storage');

    await handleOldInvoiceCompletedFlow({
      config,
      customer,
      isBusinessPlan,
      log: logger,
      maxSpaceBytes,
      product,
      subscriptionSeats: seats,
      usersService,
      storageService,
      userUuid: user.uuid,
    });
  }

  // Insert user-tier relationship if needed
  if (tier) {
    try {
      const tierType = isBusinessPlan ? 'business' : 'individual';
      const existingUserTier = await tiersService.getTierByUserIdAndTierType(localUser.id, tierType).catch((err) => {
        if (!(err instanceof TierNotFoundError)) {
          throw err;
        }

        return null;
      });

      if (!existingUserTier) {
        return tiersService.insertTierToUser(localUser.id, tier.id);
      }

      if (existingUserTier.id !== tier.id) {
        await tiersService.updateTierToUser(localUser.id, existingUserTier.id, tier.id);
      }
    } catch (error) {
      const err = error as Error;
      logger.info(
        `[${session.id}] Error while Inserting/updating the user-tier relationship. ERROR: ${err.stack ?? err.message}`,
      );
      throw err;
    }
  }

  // If the user used a coupon code, check if it is trackable and add the user-coupon relationship if needed
  await storeCouponUsedByUser({
    lineItem: lineItems,
    logger,
    usersService,
    userUuid: user.uuid,
  });

  // Clear subscription cache
  try {
    await cacheService.clearSubscription(customer.id);
    logger.info(
      `[${session.id}] Cache for user with uuid: ${user.uuid} and customer Id: ${customer.id} has been cleaned`,
    );
  } catch (err) {
    const error = err as Error;
    logger.error(
      `[${session.id}] Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription. ERROR: ${error.stack ?? error.message}`,
    );
  }
}
