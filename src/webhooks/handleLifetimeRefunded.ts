import { FastifyLoggerInstance } from 'fastify';
import CacheService from '../services/cache.service';
import { StorageService } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { AppConfig } from '../config';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { handleCancelPlan } from './utils/handleCancelPlan';
import Stripe from 'stripe';
import { PaymentService } from '../services/payment.service';
import { Service } from '../core/users/Tier';
import Logger from '../Logger';

export default async function handleLifetimeRefunded(
  storageService: StorageService,
  usersService: UsersService,
  charge: Stripe.Charge,
  cacheService: CacheService,
  paymentsService: PaymentService,
  log: FastifyLoggerInstance,
  tiersService: TiersService,
  config: AppConfig,
): Promise<void> {
  const customerId = charge.customer as string;
  const userEmail = charge.receipt_email;
  let invoiceId;
  const { uuid, lifetime } = await usersService.findUserByCustomerID(customerId);

  if (!charge.payment_intent) {
    Logger.info(
      `There is no payment intent for this charge ${charge.id}. Customer is ${customerId} and the uuid is ${uuid}`,
    );
    return;
  }

  const invoicePayments = await paymentsService.getInvoicePayment({
    payment: {
      type: 'payment_intent',
      payment_intent: charge.payment_intent as string,
    },
  });

  if (invoicePayments.data.length > 0) {
    invoiceId = invoicePayments.data[0].invoice as string;
  }

  if (!invoiceId) {
    Logger.info(
      `There is no invoice id for this payment. The customer is ${customerId} and the uuid is ${uuid}, skipping it..`,
    );
    return;
  }

  const invoice = await paymentsService.getInvoiceLineItems(invoiceId);

  const productId = invoice.data[0].pricing?.price_details?.product as string;

  log.info(
    `[LIFETIME REFUNDED]: User with customerId ${customerId} found. The uuid of the user is: ${uuid} and productId: ${productId}`,
  );

  try {
    await cacheService.clearSubscription(customerId);
    await cacheService.clearUsedUserPromoCodes(customerId);
    await cacheService.clearUserTier(uuid);
  } catch (err) {
    log.error(`Error in handleLifetimeRefunded after trying to clear ${customerId} subscription`);
  }

  try {
    await handleCancelPlan({
      customerId,
      customerEmail: userEmail ?? '',
      isLifetime: lifetime,
      productId,
      usersService,
      tiersService,
      log,
    });
  } catch (error) {
    const err = error as Error;
    log.error(`[LIFETIME REFUNDED/ERROR]: Error canceling tier product. ERROR: ${err.stack ?? err.message}`);
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }
    await usersService.updateUser(customerId, { lifetime: false });

    const freeTier = await tiersService.getTierProductsByProductsId('free');

    return storageService.updateUserStorageAndTier(
      uuid,
      freeTier.featuresPerService[Service.Drive].maxSpaceBytes,
      freeTier.featuresPerService[Service.Drive].foreignTierId,
    );
  }
}
