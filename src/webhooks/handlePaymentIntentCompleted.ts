import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import CacheService from '../services/CacheService';
import { PaymentService, PriceMetadata } from '../services/PaymentService';
import { createOrUpdateUser, updateUserTier } from '../services/StorageService';
import { CouponNotBeingTrackedError, UsersService } from '../services/UsersService';

export default async function handlePaymentIntentCompleted(
  session: Stripe.PaymentIntent,
  stripe: Stripe,
  usersService: UsersService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,

  cacheService: CacheService,
  config: AppConfig,
): Promise<void> {
  if (session.status !== 'succeeded') {
    log.info(`Checkout processed without action, ${session.receipt_email} has not paid successfully`);
    return;
  }

  const customer = await paymentService.getCustomer(session.customer as string);
  const userSubscriptions = await paymentService.getActiveSubscriptions(customer.id);

  const activeUserSubscription = userSubscriptions.filter((subscription) => subscription.status === 'active')[0];

  const items = await paymentService.getLineItems(session.invoice as string);

  const price = items.data[0].price;

  if (!price) {
    log.error(`Checkout session completed does not contain price, customer: ${session.receipt_email}`);
    return;
  }

  if (!price.metadata.maxSpaceBytes) {
    log.error(
      `Checkout session completed with a price without maxSpaceBytes as metadata. customer: ${session.receipt_email}`,
    );
    return;
  }

  const { maxSpaceBytes } = price.metadata as PriceMetadata;

  const isLifetimePlan = (price.metadata as PriceMetadata).planType === 'one_time';
  const isActiveUserPurchasingALifetimePlan = activeUserSubscription && isLifetimePlan;

  if (isActiveUserPurchasingALifetimePlan) {
    try {
      await paymentService.cancelSubscription(activeUserSubscription.id);
    } catch (error) {
      log.error(`User with customer ID ${customer.id} could not cancel the active subscription`);
    }
  }

  if (customer.deleted) {
    log.error(
      `Customer object could not be retrieved in checkout session completed handler with id ${session.customer}`,
    );
    return;
  }

  let user: { uuid: string };
  try {
    const res = await createOrUpdateUser(maxSpaceBytes, customer.email as string, config);
    user = res.data.user;
  } catch (err) {
    log.error(
      `Error while creating or updating user in checkout session completed handler, email: ${session.receipt_email}`,
    );
    log.error(err);

    throw err;
  }

  try {
    await updateUserTier(user.uuid, price.product as string, config);
  } catch (err) {
    const error = err as Error;
    log.error(
      `Error while updating user tier: email: ${session.receipt_email}, planId: ${price.product as string} `,
      error.stack ?? error.message,
    );

    throw err;
  }

  try {
    await usersService.updateUser(customer.id, {
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
    if (session.invoice) {
      const userData = await usersService.findUserByUuid(user.uuid);

      const invoice = await stripe.invoices.retrieve(session.invoice as string);

      const couponId = invoice.discount?.coupon.id;

      if (couponId) {
        await usersService.storeCouponUsedByUser(userData, couponId);
      }
    }
  } catch (err) {
    const error = err as Error;
    if (!(err instanceof CouponNotBeingTrackedError)) {
      log.error(`Error while adding user ${user.uuid} and coupon: `, error.stack ?? error.message);
      log.error(error);
    }
  }

  try {
    await cacheService.clearSubscription(customer.id);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}
