import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import { PaymentService, PriceMetadata } from '../../../services/payment.service';
import { User } from '../../../core/users/User';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { UsersService } from '../../../services/users.service';
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
import { upsertUserTierRelationship } from './utils/upsertTierUser';
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

  // 4. Handle cases for object storage
  if (isObjectStoragePlan) {
    await handleObjectStorageInvoiceCompleted(customer, session, objectStorageService, paymentService, logger);
    return;
  }

  // 5. Get customer UUID
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

  const existingUser = await usersService.findUserByUuid(user.uuid).catch(() => null);

  const lifetime = isBusinessPlan && existingUser ? existingUser.lifetime : isLifetime;

  await usersService.upsertUserByUuid(user.uuid, {
    customerId: customer.id,
    uuid: user.uuid,
    lifetime,
  });

  // 9a. Apply tier
  try {
    const existingUser = await usersService.findUserByUuid(user.uuid).catch((err) => {
      console.error(`❌ Error fetching user ${user.uuid}:`, err);
      return null;
    });

    if (!existingUser) return;

    let tier: Tier;
    let userStackedStorage: number | undefined;

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
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

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

  // 9b. Insert user-tier relationship if needed
  try {
    await upsertUserTierRelationship({
      productId: product.id,
      userUuid: user.uuid,
      billingType,
      isBusinessPlan,
      tiersService,
      usersService,
    });
  } catch (error) {
    logger.info(`[${session.id}] Error while Inserting/updating the user-tier relationship`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }
  }

  // 10. If the user used a coupon code, check if it is trackable and add the user-coupon relationship if needed
  await storeCouponUsedByUser({
    lineItem: lineItems,
    logger,
    usersService,
    userUuid: user.uuid,
  });

  // 11. Clear subscription cache
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
