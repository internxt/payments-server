import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import CacheService from '../services/CacheService';
import { PaymentService, PriceMetadata } from '../services/PaymentService';
import { createOrUpdateUser, updateUserTier } from '../services/StorageService';
import { CouponNotBeingTrackedError, UsersService } from '../services/UsersService';
import { ObjectStorageService } from '../services/ObjectStorageService';
import { UserType } from '../core/users/User';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (product as Stripe.Product).metadata !== undefined;
}

function isObjectStorageOneTimePayment(item: Stripe.InvoiceLineItem): boolean {
  return (
    typeof item.price?.product === 'object' &&
    isProduct(item.price?.product) &&
    !!item.price.product.metadata.type &&
    item.price.product.metadata.type === 'object-storage'
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
  const items = await paymentService.getInvoiceLineItems(session.id as string);

  if (items.data.length === 1 && isObjectStorageOneTimePayment(items.data[0])) {
    const [{ currency }] = items.data;

    if (!session.customer_email) {
      throw new Error('Missing customer email on session object');
    }

    await objectStorageService.initObjectStorageUser({
      email: session.customer_email,
      currency,
      customerId: customer.id,
    });
  }

  const price = items.data[0].price;
  const product = price?.product as Stripe.Product;
  const productType = product.metadata?.type;

  console.log('PRODUCT DATA: ', product);

  if (productType === UserType.Business) return;

  if (!price) {
    log.error(`Invoice completed does not contain price, customer: ${session.customer_email}`);
    return;
  }

  if (!price.metadata.maxSpaceBytes) {
    log.error(`Invoice completed with a price without maxSpaceBytes as metadata. customer: ${session.customer_email}`);
    return;
  }

  if (customer.deleted) {
    log.error(`Customer object could not be retrieved in payment intent completed handler with id ${session.customer}`);
    return;
  }

  let user: { uuid: string };
  const { maxSpaceBytes, planType } = price.metadata as PriceMetadata;
  const isLifetimePlan = planType === 'one_time';

  try {
    const userActiveSubscription = await paymentService.getActiveSubscriptions(customer.id);
    const hasActiveSubscription = userActiveSubscription.length > 0;

    if (isLifetimePlan && hasActiveSubscription) {
      await paymentService.cancelSubscription(userActiveSubscription[0].id);
    }
  } catch (error) {
    log.error(
      `Error getting active user subscriptions in payment intent completed handler, email: ${session.customer_email}`,
    );
  }

  try {
    const res = await createOrUpdateUser(maxSpaceBytes, customer.email as string, config);
    user = res.data.user;
  } catch (err) {
    log.error(
      `Error while creating or updating user in payment intent completed handler, email: ${session.customer_email}`,
    );
    log.error(err);

    throw err;
  }

  try {
    await updateUserTier(user.uuid, product.id, config);
  } catch (err) {
    const error = err as Error;
    log.error(
      `Error while updating user tier: email: ${session.customer_email}, priceId: ${price.product as string} `,
      error.stack ?? error.message,
    );

    throw err;
  }

  try {
    const customerByUuid = await usersService.findUserByUuid(user.uuid);

    await usersService.updateUser(customerByUuid.customerId, {
      lifetime: isLifetimePlan,
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

      const couponId = (items.data[0].discounts[0] as any).coupon.id;

      if (couponId) {
        await usersService.storeCouponUsedByUser(userData, couponId);
      }
    }
  } catch (err) {
    const error = err as Error;
    if (!(err instanceof CouponNotBeingTrackedError)) {
      log.error(`Error while adding user ${user.uuid} and coupon: ${error.stack ?? error.message}`);
      log.error(error);
    }
  }

  try {
    await cacheService.clearSubscription(customer.id);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
