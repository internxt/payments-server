import Stripe from 'stripe';
import { UsersService } from '../services/users.service';
import { StorageService } from '../services/storage.service';
import CacheService from '../services/cache.service';
import { AppConfig } from '../config';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import { PaymentService } from '../services/payment.service';
import { FastifyBaseLogger } from 'fastify';
import { TiersService } from '../services/tiers.service';

interface HandleDisputeResultProps {
  dispute: Stripe.Dispute;
  stripe: Stripe;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  cacheService?: CacheService;
  tiersService: TiersService;
  log: FastifyBaseLogger;
  config: AppConfig;
}

export async function handleDisputeResult({
  dispute,
  stripe,
  paymentService,
  usersService,
  storageService,
  tiersService,
  log,
  config,
  cacheService,
}: HandleDisputeResultProps) {
  if (dispute.status !== 'lost') {
    return;
  }

  const chargeId = dispute.charge as string;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id as string);
    const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice?.id as string);

    const { subscription: subscriptionId } = await stripe.invoices.retrieve(invoiceId as string);
    const { lifetime } = await usersService.findUserByCustomerID(customerId);

    if (lifetime) {
      await handleLifetimeRefunded(
        storageService,
        usersService,
        charge,
        paymentService,
        log,
        tiersService,
        config,
        cacheService,
      );
    } else {
      await paymentService.cancelSubscription(subscriptionId as string);
    }
  } catch (error) {
    throw error;
  }
}
