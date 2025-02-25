/* eslint-disable max-len */
import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import CacheService from '../services/cache.service';
import { PaymentService, PriceMetadata } from '../services/payment.service';
import { createOrUpdateUser, updateUserTier } from '../services/storage.service';
import { CouponNotBeingTrackedError, UsersService } from '../services/users.service';
import { ObjectStorageService } from '../services/objectStorage.service';
import { UserType } from '../core/users/User';

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
  log: FastifyLoggerInstance,
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
  log: FastifyLoggerInstance,
  cacheService: CacheService,
  config: AppConfig,
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

  const items = await paymentService.getInvoiceLineItems(session.id as string);
  const price = items.data?.[0].price;
  if (!price) {
    log.error(`Invoice completed does not contain price, customer: ${session.customer_email}`);
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
  const { maxSpaceBytes, planType } = price.metadata as PriceMetadata;
  const isLifetimePlan = planType === 'one_time';

  try {
    const userActiveSubscription = await paymentService.getActiveSubscriptions(customer.id);
    const hasIndividualActiveSubscription = userActiveSubscription.find(
      (sub) =>
        sub.product?.metadata.type !== UserType.Business && sub.product?.metadata.type !== UserType.ObjectStorage,
    );
    const shouldCancelCurrentActiveSubscription = isLifetimePlan && hasIndividualActiveSubscription;

    if (shouldCancelCurrentActiveSubscription) {
      await paymentService.cancelSubscription(hasIndividualActiveSubscription.id);
    }
  } catch (error) {
    log.error(
      `Error getting active user subscriptions in payment intent completed handler, email: ${session.customer_email}`,
    );
  }

  if (isBusinessPlan) {
    const email = customer.email ?? session.customer_email;

    try {
      user = await usersService.findUserByCustomerID(customer.id);
    } catch (err) {
      if (email) {
        const response = await usersService.findUserByEmail(email);
        user = response.data;
      } else {
        log.error(`Error searching for an user by email in checkout session completed handler, email: ${email}`);
        log.error(err);
        throw err;
      }
    }
  } else {
    try {
      const res = await createOrUpdateUser(maxSpaceBytes, customer.email as string, config);
      user = res.data.user;
    } catch (err) {
      log.error(
        `Error while creating or updating user in checkout session completed handler, email: ${session.customer_email}`,
      );
      log.error(err);

      throw err;
    }

    if (user) {
      try {
        await updateUserTier(user.uuid, product.id, config);
      } catch (err) {
        log.error(`Error while updating user tier: email: ${session.customer_email}, planId: ${product.id} `);
        log.error(err);

        throw err;
      }
    }
  }

  try {
    const { lifetime } = await usersService.findUserByCustomerID(customer.id);
    const isLifetimeCurrentSub = isBusinessPlan ? lifetime : isLifetimePlan;
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

  try {
    if (session.id) {
      const userData = await usersService.findUserByUuid(user.uuid);
      const areDiscounts = items.data[0].discounts.length > 0;

      if (areDiscounts) {
        const coupon = (items.data[0].discounts[0] as Stripe.Discount).coupon;

        if (coupon) {
          await usersService.storeCouponUsedByUser(userData, coupon.id);
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    if (!(err instanceof CouponNotBeingTrackedError)) {
      log.error(`Error while adding user ${user.uuid} and coupon: ${error.stack ?? error.message}`);
      log.error(error);
    }
  }

  if (isBusinessPlan) {
    const amountOfSeats = items.data[0].quantity;
    if (!amountOfSeats) return;

    const address = customer.address?.line1 ?? undefined;
    const phoneNumber = customer.phone ?? undefined;

    try {
      await usersService.updateWorkspaceStorage(user.uuid, Number(maxSpaceBytes), amountOfSeats);
      log.info(
        `USER WITH CUSTOMER ID: ${customer.id} - UUID: ${user.uuid} - EMAIL: ${
          customer.email ?? session.customer_email
        } HAS BEEN UPDATED HIS WORKSPACE`,
      );
    } catch (err) {
      const error = err as Error;
      const statusCode = (err as any)?.response.status;

      if (!statusCode || statusCode !== 404) {
        log.error(`[ERROR UPDATING WORKSPACE]: ${error.stack ?? error.message}`);
        throw err;
      }

      log.info(
        `USER WITH CUSTOMER ID: ${customer.id} - UUID: ${user.uuid} - EMAIL: ${
          customer.email ?? session.customer_email
        } DOES NOT HAVE ANY WORKSPACE TO UPDATE, CREATING A NEW ONE`,
      );
      await usersService.initializeWorkspace(user.uuid, {
        newStorageBytes: Number(maxSpaceBytes),
        seats: amountOfSeats,
        address,
        phoneNumber,
      });
    }
  }

  try {
    await cacheService.clearSubscription(customer.id);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
