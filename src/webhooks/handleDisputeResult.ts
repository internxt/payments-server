import Stripe from 'stripe';
import { UsersService } from '../services/users.service';
import { StorageService } from '../services/storage.service';
import CacheService from '../services/cache.service';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import { PaymentService } from '../services/payment.service';
import { TiersService } from '../services/tiers.service';
import { PreCreatedUserService } from '../services/preCreatedUser.service';
import { NotFoundError } from '../errors/Errors';

interface HandleDisputeResultProps {
  dispute: Stripe.Dispute;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  cacheService: CacheService;
  tiersService: TiersService;
  preCreatedUserService: PreCreatedUserService;
}

export async function handleDisputeResult({
  dispute,
  paymentService,
  usersService,
  storageService,
  cacheService,
  tiersService,
  preCreatedUserService,
}: HandleDisputeResultProps) {
  if (dispute.status !== 'lost') {
    return;
  }

  const chargeId = dispute.charge as string;
  try {
    const charge = await paymentService.retrieveCustomerChargeByChargeId(chargeId);
    const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id as string);
    const { lifetime } = await usersService.findUserByCustomerID(customerId);

    if (lifetime) {
      await handleLifetimeRefunded(
        storageService,
        usersService,
        charge,
        cacheService,
        paymentService,
        tiersService,
        preCreatedUserService,
      );
    } else {
      const invoiceId = await paymentService.getInvoiceIdFromCharge(charge);
      if (!invoiceId) throw new NotFoundError(`Disputed charge ${chargeId} does not belong to an invoice`);

      const invoice = await paymentService.getInvoice(invoiceId);
      const subscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      await paymentService.cancelSubscription(subscriptionId as string);
    }
  } catch (error) {
    throw error;
  }
}
