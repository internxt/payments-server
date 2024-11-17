import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import CacheService from '../services/cache.service';
import { PaymentService, PriceMetadata } from '../services/payment.service';
import { createOrUpdateUser, updateUserTier } from '../services/storage.service';
import { CouponNotBeingTrackedError, UsersService } from '../services/users.service';
import { UserType } from '../core/users/User';

export default async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  usersService: UsersService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,
  cacheService: CacheService,
  config: AppConfig,
): Promise<void> {
  if (session.payment_status !== 'paid') {
    log.info(`Checkout processed without action, ${session.customer_email} has not paid successfully`);
    return;
  }

  const lineItems = await paymentService.getCheckoutLineItems(session.id);

  const price = lineItems.data[0].price;
  const product = price?.product as Stripe.Product;
  const userType = product.metadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  if (!price) {
    log.error(`Checkout session completed does not contain price, customer: ${session.customer_email}`);
    return;
  }

  if (!price.metadata.maxSpaceBytes) {
    log.error(
      `Checkout session completed with a price without maxSpaceBytes as metadata. customer: ${session.customer_email}`,
    );
    return;
  }

  const { maxSpaceBytes } = price.metadata as PriceMetadata;

  const customer = await paymentService.getCustomer(session.customer as string);
  if (customer.deleted) {
    log.error(
      `Customer object could not be retrieved in checkout session completed handler with id ${session.customer}`,
    );
    return;
  }

  let user: { uuid: string } | null = null;
  if (userType === UserType.Individual) {
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
  } else {
    const email = customer.email || session.customer_email;

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
  }

  if (!user) {
    log.error(`Error searching for user in checkout session completed handler, email: ${session.customer_email}`);
    return;
  }

  try {
    const { customerId } = await usersService.findUserByUuid(user.uuid);
    if ((price.metadata as PriceMetadata).planType === 'one_time') {
      await usersService.updateUser(customerId, {
        lifetime: (price.metadata as PriceMetadata).planType === 'one_time',
      });
    }
  } catch {
    await usersService.insertUser({
      customerId: customer.id,
      uuid: user.uuid,
      lifetime: (price.metadata as PriceMetadata).planType === 'one_time',
    });
  }

  try {
    if (session.total_details?.amount_discount) {
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
      log.error(`Error while adding user ${user.uuid} and coupon: ${error.stack ?? error.message} `);
      log.error(error);
    }
  }

  try {
    await cacheService.clearSubscription(customer.id, userType);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }

  if (userType === UserType.Business) {
    const amountOfSeats = lineItems.data[0]!.quantity!;
    const address = customer.address?.line1 ?? undefined;
    const phoneNumber = customer.phone ?? undefined;

    await usersService.initializeWorkspace(user.uuid, {
      newStorageBytes: Number(maxSpaceBytes),
      seats: amountOfSeats,
      address,
      phoneNumber,
    });
  }
}
