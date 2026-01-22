import Stripe from 'stripe';
import { UsersService } from '../services/users.service';
import { StorageService } from '../services/storage.service';
import CacheService from '../services/cache.service';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import { PaymentService } from '../services/payment.service';
import { TiersService } from '../services/tiers.service';

interface HandleDisputeResultProps {
  dispute: Stripe.Dispute;
  stripe: Stripe;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  cacheService: CacheService;
  tiersService: TiersService;
}

export async function handleDisputeResult({
  dispute,
  stripe,
  paymentService,
  usersService,
  storageService,
  cacheService,
  tiersService,
}: HandleDisputeResultProps) {
  if (dispute.status !== 'lost') {
    return;
  }

  const chargeId = dispute.charge as string;
  const charge = await stripe.charges.retrieve(chargeId);
  const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id as string);
  const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice?.id as string);

  const { subscription: subscriptionId } = await stripe.invoices.retrieve(invoiceId);
  const { lifetime } = await usersService.findUserByCustomerID(customerId);

  if (lifetime) {
    await handleLifetimeRefunded(storageService, usersService, charge, cacheService, paymentService, tiersService);
  } else {
    await paymentService.cancelSubscription(subscriptionId as string);
  }
}
