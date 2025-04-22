import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import { PaymentService, PriceMetadata } from '../services/payment.service';
import { User, UserType } from '../core/users/User';
import { ObjectStorageService } from '../services/objectStorage.service';
import { CouponNotBeingTrackedError, UsersService } from '../services/users.service';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { fetchUserStorage } from '../utils/fetchUserStorage';
import { ExpandStorageNotAvailableError } from './utils/handleStackLifetimeStorage';
import CacheService from '../services/cache.service';
import { handleOldInvoiceCompletedFlow } from './utils/handleOldInvoiceCompletedFlow';
import config from '../config';
import { StorageService } from '../services/storage.service';
import { Service, Tier } from '../core/users/Tier';
import { handleObjectStorageInvoiceCompleted } from './utils/handleObjStorageInvoiceCompleted';

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

async function upsertUser({
  customerId,
  usersService,
  userUuid,
  isBusinessPlan,
  isLifetime,
}: {
  customerId: string;
  usersService: UsersService;
  userUuid: User['uuid'];
  isBusinessPlan: boolean;
  isLifetime: boolean;
}) {
  try {
    const userByCustomerId = await usersService.findUserByCustomerID(customerId);
    const isLifetimeCurrentSub = isBusinessPlan ? userByCustomerId.lifetime : isLifetime;
    await usersService.updateUser(customerId, {
      lifetime: isLifetimeCurrentSub,
    });
  } catch {
    await usersService.insertUser({
      customerId: customerId,
      uuid: userUuid,
      lifetime: isLifetime,
    });
  }
}

async function handleUserTierRelationship({
  productId,
  userUuid,
  billingType,
  isBusinessPlan,
  tiersService,
  usersService,
}: {
  billingType: Tier['billingType'];
  productId: string;
  userUuid: User['uuid'];
  isBusinessPlan: boolean;
  tiersService: TiersService;
  usersService: UsersService;
}) {
  const tier = await tiersService.getTierProductsByProductsId(productId, billingType);
  const existingUser = await usersService.findUserByUuid(userUuid);
  const userExistingTiers = await tiersService.getTiersProductsByUserId(existingUser.id);

  const tierToUpdate = isBusinessPlan
    ? userExistingTiers.find((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled)
    : userExistingTiers[0];

  if (!tierToUpdate) {
    throw new TierNotFoundError(`User with ID: ${userUuid} does not have any tier attached to him`);
  }

  try {
    await tiersService.updateTierToUser(existingUser.id, tierToUpdate.id, tier.id);
  } catch (error) {
    await tiersService.insertTierToUser(existingUser.id, tier.id);
  }
}

export async function handleInvoiceCompletedV2({
  session,
  objectStorageService,
  paymentService,
  tiersService,
  storageService,
  usersService,
  cacheService,
  logger,
}: HandleInvoiceCompletedProps) {
  const invoiceId = session.id;
  // 1. Check if the invoice is paid (status = paid)
  if (session.status !== 'paid') {
    logger.error(`The invoice ${invoiceId} has not paid successfully, processed without action`);
    return;
  }

  // 2. Get customer data
  const customerId = session.customer as string;
  const customer = await paymentService.getCustomer(customerId);

  if (customer.deleted) {
    logger.error(`Customer ${customerId} from invoice ${invoiceId} does not exist or has been deleted.`);
    return;
  }

  // 3. Get the necessary purchased product info (invoice line item)
  const invoiceLineItems = await paymentService.getInvoiceLineItems(invoiceId);

  const price = invoiceLineItems.data?.[0].price;
  if (!price) {
    logger.error(`Invoice completed with id ${invoiceId} does not contain price, customer: ${session.customer_email}`);
    return;
  }

  const product = price?.product as Stripe.Product;
  const productType = product.metadata?.type;
  const isBusinessPlan = productType === UserType.Business;
  const isObjStoragePlan = productType === UserType.ObjectStorage;
  const { maxSpaceBytes, planType } = price.metadata as PriceMetadata;
  const customerEmail = customer.email ?? session.customer_email;
  const amountOfSeats = invoiceLineItems.data?.[0].quantity;
  const isLifetime = planType === 'one_time';
  const billingType = isLifetime ? 'lifetime' : 'subscription';
  let user: { uuid: string };
  let userStackedStorage;

  // 4. Handle cases for object storage
  if (isObjStoragePlan) {
    await handleObjectStorageInvoiceCompleted(customer, session, objectStorageService, paymentService, logger);
  }

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

  // 5. Check if the user purchased a lifetime and has an active subscription
  const userActiveSubscription = await paymentService.getUserSubscription(customerId, UserType.Individual);
  const userHasActiveSubscription = userActiveSubscription.type === 'subscription';

  // 6. If has an active subscription, cancel it to apply the lifetime tier
  if (isLifetime && userHasActiveSubscription) {
    try {
      logger.info(
        `User with customer id: ${customer.id} amd email ${customer.email} has an active individual subscription and is buying a lifetime plan. Cancelling individual plan`,
      );
      await paymentService.cancelSubscription(userActiveSubscription.subscriptionId);
    } catch (error) {
      logger.error(
        `Error while cancelling the user active subscription - CUSTOMER ID: ${customerId} / SUBSCRIPTION ID: ${userActiveSubscription.subscriptionId}`,
      );
    }
  }

  // 7. If has a lifetime, stack storage (increasing maxSpaceBytes)
  if (isLifetime) {
    try {
      const userData = await usersService.findUserByUuid(user.uuid);
      const userHasLifetime = userData.lifetime;

      if (userHasLifetime) {
        const lifetimeTier = await tiersService.getTierProductsByProductsId(product.id, 'lifetime');

        userStackedStorage = await getStackedSpace(
          { uuid: user.uuid, email: customerEmail as string },
          lifetimeTier.featuresPerService[Service.Drive].maxSpaceBytes,
        );

        logger.info(`[LIFETIME/STACK] User ${user.uuid} will stack storage up to ${userStackedStorage} bytes`);
      }
    } catch (error) {
      logger.warn(`Could not stack storage for user ${user.uuid}: ${(error as Error).message}`);
    }
  }
  // 8a. Apply tier
  try {
    const tier = await tiersService.getTierProductsByProductsId(product.id, billingType);
    if (userStackedStorage) tier.featuresPerService[Service.Drive].maxSpaceBytes = userStackedStorage;
    await tiersService.applyTier(
      { uuid: user.uuid, email: customerEmail as string },
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
      subscriptionSeats: invoiceLineItems.data[0].quantity,
      usersService,
      storageService,
      userUuid: user.uuid,
    });
  }

  // 8b. Insert - update user
  await upsertUser({
    customerId: customer.id,
    userUuid: user.uuid,
    isBusinessPlan,
    isLifetime,
    usersService,
  });

  // 8c. Insert user-tier relationship if needed
  await handleUserTierRelationship({
    productId: product.id,
    userUuid: user.uuid,
    billingType,
    isBusinessPlan,
    tiersService,
    usersService,
  });

  // 9. If the user used a coupon code, check if it is trackable and add the user-coupon relationship if needed
  try {
    if (session.id) {
      const userData = await usersService.findUserByUuid(user.uuid);
      const areDiscounts = invoiceLineItems.data[0].discounts.length > 0;
      if (areDiscounts) {
        const coupon = (invoiceLineItems.data[0].discounts[0] as Stripe.Discount).coupon;

        if (coupon) {
          await usersService.storeCouponUsedByUser(userData, coupon.id);
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    if (!(err instanceof CouponNotBeingTrackedError)) {
      logger.error(`[USER-COUPON/ERROR]: ${error.stack ?? error.message} / USER UUID:  ${user.uuid}`);
    }
  }

  // 10. Clear subscription cache
  try {
    await cacheService.clearSubscription(customer.id);
    logger.info(`Cache for user with uuid: ${user.uuid} and customer Id: ${customer.id} has been cleaned`);
  } catch (err) {
    logger.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
