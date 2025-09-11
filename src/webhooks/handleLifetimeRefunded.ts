import { FastifyLoggerInstance } from 'fastify';
import { FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/cache.service';
import { StorageService } from '../services/storage.service';
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
  const { uuid, lifetime } = await usersService.findUserByCustomerID(customerId);

  const invoice = await paymentsService.getInvoiceLineItems(invoiceId);
  const product = invoice.data[0].price?.product;

  let productId: string = '';

  if (typeof product === 'string') {
    productId = product;
  } else if (product && 'id' in product) {
    productId = product.id;
  }

  log.info(
    `[LIFETIME REFUNDED]: User with customerId ${customerId} found. The uuid of the user is: ${uuid} and productId: ${productId}`,
  );

  try {
    await cacheService.clearSubscription(customerId);
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

    return storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
  }
}
