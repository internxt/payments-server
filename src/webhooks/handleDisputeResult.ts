import Stripe from 'stripe';
import { UsersService } from '../services/users.service';
import { StorageService } from '../services/storage.service';
import CacheService from '../services/cache.service';
import { AppConfig } from '../config';
import handleLifetimeRefunded from './handleLifetimeRefunded';
import { PaymentService } from '../services/payment.service';
import { FastifyBaseLogger } from 'fastify';
import { TiersService } from '../services/tiers.service';
import Logger from '../Logger';

interface HandleDisputeResultProps {
  dispute: Stripe.Dispute;
  stripe: Stripe;
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  cacheService: CacheService;
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
  cacheService,
  tiersService,
  log,
  config,
}: HandleDisputeResultProps) {
  if (dispute.status !== 'lost') {
    return;
  }

  const chargeId = dispute.charge as string;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id as string);
    let invoiceId = null;

    if (!charge.payment_intent) {
      Logger.info(
        `There is no payment intent for this payment. THe customer is ${customerId} and the charge is ${chargeId}`,
      );
      return;
    }

    const invoicePayments = await paymentService.getInvoicePayment({
      payment: {
        type: 'payment_intent',
        payment_intent: charge.payment_intent as string,
      },
    });

    if (invoicePayments.data.length > 0) {
      invoiceId = invoicePayments.data[0].invoice;
    }

    const { lines } = await stripe.invoices.retrieve(invoiceId as string);
    const subscriptionId = lines.data[0].subscription;
    const { lifetime } = await usersService.findUserByCustomerID(customerId);

    if (lifetime) {
      await handleLifetimeRefunded(
        storageService,
        usersService,
        charge,
        cacheService,
        paymentService,
        log,
        tiersService,
        config,
      );
    } else {
      await paymentService.cancelSubscription(subscriptionId as string);
    }
  } catch (error) {
    throw error;
  }
}
