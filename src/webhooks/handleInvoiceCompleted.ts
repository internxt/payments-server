/* eslint-disable max-len */
import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import CacheService from '../services/cache.service';
import { PaymentService, PriceMetadata } from '../services/payment.service';
import { CouponNotBeingTrackedError, UsersService } from '../services/users.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { UserType } from '../core/users/User';
import { handleUserFeatures } from './utils/handleUserFeatures';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { handleOldInvoiceCompletedFlow } from './utils/handleOldInvoiceCompletedFlow';
import config from '../config';
import { StorageService } from '../services/storage.service';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (
    (product as Stripe.Product).metadata &&
    !!(product as Stripe.Product).metadata.type &&
    (product as Stripe.Product).metadata.type === 'object-storage'
  );
}

export async function handleObjectStorageInvoiceCompleted(
  customer: Stripe.Customer,
  invoice: Stripe.Invoice,
  objectStorageService: ObjectStorageService,
  paymentService: PaymentService,
  log: FastifyBaseLogger,
) {
  if (invoice.lines.data.length !== 1) {
    log.info(`Invoice ${invoice.id} not handled by object-storage handler due to lines length`);
    return;
  }

  const [item] = invoice.lines.data;
  const { customer_email } = invoice;
  const { price } = item;

  if (!price || !price.product) {
    log.info(`Invoice ${invoice.id} not handled by object-storage handler`);
    return;
  }

  const product = await paymentService.getProduct(price.product as string);

  if (!isProduct(product)) {
    log.info(`Invoice ${invoice.id} for product ${price.product} is not an object-storage product`);
    return;
  }

  await objectStorageService.reactivateAccount({ customerId: customer.id });

  log.info(
    `Object Storage user ${customer_email} (customer ${customer.id}) has been reactivated (if it was suspended)`,
  );
}

export default async function handleInvoiceCompleted(
  session: Stripe.Invoice,
  usersService: UsersService,
  paymentService: PaymentService,
  log: FastifyBaseLogger,
  cacheService: CacheService,
  tiersService: TiersService,
  storageService: StorageService,
  objectStorageService: ObjectStorageService,
): Promise<void> {
  if (session.status !== 'paid') {
    log.info(`Invoice processed without action, ${session.customer_email} has not paid successfully`);
    return;
  }

  const customer = await paymentService.getCustomer(session.customer as string);

  if (customer.deleted) {
    log.error(
      `Customer ${session.customer} could not be retrieved in invoice.payment_succeeded event for invoice ${session.id}`,
    );
    return;
  }

  const items = await paymentService.getInvoiceLineItems(session.id);
  const price = items.data?.[0].price;
  if (!price) {
    log.error(`Invoice completed with id ${session.id} does not contain price, customer: ${session.customer_email}`);
    return;
  }

  const product = price?.product as Stripe.Product;
  const productType = product.metadata?.type;
  const isBusinessPlan = productType === UserType.Business;
  const isObjStoragePlan = productType === UserType.ObjectStorage;

  if (isObjStoragePlan) {
    await handleObjectStorageInvoiceCompleted(customer, session, objectStorageService, paymentService, log);
  }

  if (!price.metadata.maxSpaceBytes) {
    log.error(`Invoice completed with a price without maxSpaceBytes as metadata. customer: ${session.customer_email}`);
    return;
  }

  let user: { uuid: string };
  const { planType } = price.metadata as PriceMetadata;
  const isLifetimePlan = planType === 'one_time';

  try {
    const userActiveSubscription = await paymentService.getActiveSubscriptions(customer.id);
    const hasIndividualActiveSubscription = userActiveSubscription.find(
      (sub) =>
        sub.product?.metadata.type !== UserType.Business && sub.product?.metadata.type !== UserType.ObjectStorage,
    );
    const shouldCancelCurrentActiveSubscription = isLifetimePlan && hasIndividualActiveSubscription;

    if (shouldCancelCurrentActiveSubscription) {
      log.info(
        `User with customer id: ${customer.id} amd email ${customer.email} has an active individual subscription and is buying a lifetime plan. Cancelling individual plan`,
      );
      await paymentService.cancelSubscription(hasIndividualActiveSubscription.id);
    }
  } catch (error) {
    log.error(
      `Error getting active user subscriptions in payment intent completed handler, email: ${session.customer_email}`,
    );
  }

  const email = customer.email ?? session.customer_email;

  log.info(
    `Searching for the user with mail ${email} and customer Id ${customer.id} in the local DB or directly in Drive...`,
  );

  try {
    user = await usersService.findUserByCustomerID(customer.id);
  } catch (err) {
    if (email) {
      const response = await usersService.findUserByEmail(email.toLowerCase());
      user = response.data;
    } else {
      log.error(
        `Error searching for an user by email in checkout session completed handler, email: ${email}. ERROR: ${err}`,
      );
      throw err;
    }
  }

  log.info(`User with uuid ${user.uuid} was found. Now, updating the user available products`);

  try {
    await handleUserFeatures({
      customer,
      paymentService,
      isLifetimeCurrentSub: isLifetimePlan,
      usersService,
      purchasedItem: items.data[0],
      tiersService,
      storageService,
      user: {
        email: email ?? '',
        uuid: user.uuid,
      },
      logger: log,
    });
  } catch (error) {
    const err = error as Error;
    log.error(`[USER FEATURES/ERROR]: Error while applying the tier products to the user: ${err.message}`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }

    const maxSpaceBytes = price.metadata.maxSpaceBytes;

    try {
      await handleOldInvoiceCompletedFlow({
        config: config,
        customer,
        isBusinessPlan,
        log,
        maxSpaceBytes,
        product,
        subscriptionSeats: items.data[0].quantity,
        usersService,
        storageService,
        userUuid: user.uuid,
      });

      try {
        const userByCustomerId = await usersService.findUserByCustomerID(customer.id);
        const isLifetimeCurrentSub = isBusinessPlan ? userByCustomerId.lifetime : isLifetimePlan;
        await usersService.updateUser(customer.id, {
          lifetime: isLifetimeCurrentSub,
        });
      } catch {
        await usersService.insertUser({
          customerId: customer.id,
          uuid: user.uuid,
          lifetime: isLifetimePlan,
        });
      }
    } catch (error) {
      const err = error as Error;
      log.error(`ERROR APPLYING USER FEATURES: ${err.stack ?? err.message}`);
      throw error;
    }
  }

  log.info(`User with uuid: ${user.uuid} added/updated in the local DB and available products also updated`);

  console.log('SIUU');
  try {
    const userData = await usersService.findUserByUuid(user.uuid);

    const areDiscounts = isLifetimePlan ? items.data[0].discounts.length > 0 : !!session.discount?.coupon;
    console.log(`ARE DISCOUNTS: ${areDiscounts}`);
    if (areDiscounts) {
      const coupon = isLifetimePlan ? (items.data[0].discounts[0] as Stripe.Discount).coupon : session.discount?.coupon;

      if (coupon) {
        await usersService.storeCouponUsedByUser(userData, coupon.id);
      }
    }
  } catch (err) {
    const error = err as Error;
    console.log('ERROR IN STORE COUPON');
    if (!(err instanceof CouponNotBeingTrackedError)) {
      log.error(`Error while adding user ${user.uuid} and coupon: ${error.stack ?? error.message}`);
    }
  }

  try {
    await cacheService.clearSubscription(customer.id);
    log.info(`Cache for user with uuid: ${user.uuid} and customer Id: ${customer.id} has been cleaned`);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
