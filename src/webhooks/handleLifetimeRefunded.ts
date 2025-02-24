import { FastifyLoggerInstance } from 'fastify';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/cache.service';
import { StorageService, updateUserTier } from '../services/storage.service';
import { UsersService } from '../services/users.service';
import { AppConfig } from '../config';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { handleCancelPlan } from './utils/handleCancelPlan';
import Stripe from 'stripe';
import { PaymentService } from '../services/payment.service';

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
  const invoiceId = charge.invoice as string;
  const { uuid } = await usersService.findUserByCustomerID(customerId);

  const invoice = await paymentsService.getInvoiceLineItems(invoiceId);
  const productId = invoice.data[0].price?.product as string;

  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleLifetimeRefunded after trying to clear ${customerId} subscription`);
  }

  try {
    await handleCancelPlan({
      customerId,
      customerEmail: userEmail ?? '',
      productId,
      usersService,
      tiersService,
      log,
    });
  } catch (error) {
    if (!(error instanceof TierNotFoundError)) {
      throw error;
    }
    await usersService.updateUser(customerId, { lifetime: false });

    try {
      await updateUserTier(uuid, FREE_INDIVIDUAL_TIER, config);
    } catch (err) {
      log.error(`Error while updating user tier: uuid: ${uuid} `);
      log.error(err);
      throw err;
    }

    return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
  }
}
