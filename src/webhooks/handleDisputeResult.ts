import Stripe from 'stripe';
import { UsersService } from '../services/users.service';
import { StorageService } from '../services/storage.service';
import CacheService from '../services/cache.service';
import { AppConfig } from '../config';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import { PaymentService } from '../services/payment.service';
import { FastifyBaseLogger } from 'fastify';

interface HandleDisputeResultProps {
  charge: Stripe.Dispute;
  stripe: Stripe;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  cacheService: CacheService;
  log: FastifyBaseLogger;
  config: AppConfig;
}

export async function handleDisputeResult({
  charge,
  stripe,
  paymentService,
  usersService,
  storageService,
  cacheService,
  log,
  config,
}: HandleDisputeResultProps) {
  if (charge.status !== 'lost') {
    return;
  }

  const chargeId = charge.charge as string;
  try {
    const { customer, invoice } = await stripe.charges.retrieve(chargeId);
    const customerId = typeof customer === 'string' ? customer : (customer?.id as string);
    const invoiceId = typeof invoice === 'string' ? invoice : (invoice?.id as string);

    const { subscription: subscriptionId } = await stripe.invoices.retrieve(invoiceId as string);
    const { lifetime } = await usersService.findUserByCustomerID(customerId);
    const activeSubscription = await stripe.subscriptions.retrieve(subscriptionId as string);

    if (lifetime) {
      await handleLifetimeRefunded(storageService, usersService, customerId, cacheService, log, config);
    } else {
      if (!activeSubscription || activeSubscription.status !== 'active') {
        return;
      }
      await paymentService.cancelSubscription(subscriptionId as string);
    }
  } catch (error) {
    throw error;
  }
}
