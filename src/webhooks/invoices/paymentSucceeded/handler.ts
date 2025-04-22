import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import { PaymentService, PriceMetadata } from '../../../services/payment.service';
import { User, UserType } from '../../../core/users/User';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { UsersService } from '../../../services/users.service';
import { TierNotFoundError, TiersService } from '../../../services/tiers.service';
import { fetchUserStorage } from '../../../utils/fetchUserStorage';
import { ExpandStorageNotAvailableError } from '../../utils/handleStackLifetimeStorage';
import CacheService from '../../../services/cache.service';
import { handleOldInvoiceCompletedFlow } from '../../utils/handleOldInvoiceCompletedFlow';
import config from '../../../config';
import { StorageService } from '../../../services/storage.service';
import { Service } from '../../../core/users/Tier';
import { handleObjectStorageInvoiceCompleted } from '../../utils/handleObjStorageInvoiceCompleted';
import { buildInvoiceContext, InvoiceContext } from './utils/buildInvoiceContext';
import { upsertUser } from './utils/upsertUser';
import { upsertUserTierRelationship } from './utils/upsertTierUser';
import { storeCouponUsedByUser } from './utils/storeCouponUsedByUser';

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
    logger.error(`The invoice ${session.id} has not paid successfully, processed without action`);
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
    logger.error(`Customer ${customerId} from invoice ${invoiceId} does not exist or has been deleted.`);
    return;
  }

  if (!price) {
    logger.error(`Invoice completed with id ${invoiceId} does not contain price, customer: ${session.customer_email}`);
    return;
  }

  const { maxSpaceBytes } = price.metadata as PriceMetadata;
  const amountOfSeats = seats;
  let user: { uuid: string };
  let userStackedStorage;

  // 4. Handle cases for object storage
  if (isObjectStoragePlan) {
    await handleObjectStorageInvoiceCompleted(customer, session, objectStorageService, paymentService, logger);
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
        `Error searching for an user by email in checkout session completed handler, email: ${customerEmail}. ERROR: ${err}`,
      );
      throw err;
    }
  }

  // 6. Check if the user purchased a lifetime and has an active subscription
  const userActiveSubscription = await paymentService.getUserSubscription(customerId, UserType.Individual);
  const userHasActiveSubscription = userActiveSubscription.type === 'subscription';

  // 7. If has an active subscription, cancel it to apply the lifetime tier
  if (isLifetime && userHasActiveSubscription) {
    try {
      logger.info(
        `User with customer id: ${customer.id} amd email ${customer.email} has an active individual subscription and is buying a lifetime plan. Cancelling individual plan`,
      );
      await paymentService.cancelSubscription(userActiveSubscription.subscriptionId);
    } catch (error) {
      const err = error as Error;
      logger.error(
        `Error while cancelling the user active subscription - CUSTOMER ID: ${customerId} / SUBSCRIPTION ID: ${userActiveSubscription.subscriptionId}. ERROR: ${err.stack ?? err.message}`,
      );
    }
  }

  // 8. If has a lifetime, stack storage (increasing maxSpaceBytes)
  if (isLifetime) {
    try {
      const userData = await usersService.findUserByUuid(user.uuid);
      const userHasLifetime = userData.lifetime;

      if (userHasLifetime) {
        const lifetimeTier = await tiersService.getTierProductsByProductsId(product.id, 'lifetime');

        userStackedStorage = await getStackedSpace(
          { uuid: user.uuid, email: customerEmail },
          lifetimeTier.featuresPerService[Service.Drive].maxSpaceBytes,
        );

        logger.info(`[LIFETIME/STACK] User ${user.uuid} will stack storage up to ${userStackedStorage} bytes`);
      }
    } catch (error) {
      logger.warn(`Could not stack storage for user ${user.uuid}: ${(error as Error).message}`);
    }
  }
  // 9a. Apply tier
  try {
    const tier = await tiersService.getTierProductsByProductsId(product.id, billingType);
    if (userStackedStorage) tier.featuresPerService[Service.Drive].maxSpaceBytes = userStackedStorage;
    await tiersService.applyTier(
      { uuid: user.uuid, email: customerEmail },
      customer,
      amountOfSeats,
      product.id,
      logger,
      tier,
    );
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

  // 9b. Insert - update user
  await upsertUser({
    customerId: customer.id,
    userUuid: user.uuid,
    isBusinessPlan,
    isLifetime,
    usersService,
  });

  // 9c. Insert user-tier relationship if needed
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
    logger.info('');
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
    logger.info(`Cache for user with uuid: ${user.uuid} and customer Id: ${customer.id} has been cleaned`);
  } catch (err) {
    logger.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
