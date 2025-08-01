import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

import { StorageService } from '../../../services/storage.service';
import { UsersService } from '../../../services/users.service';
import { PaymentService } from '../../../services/payment.service';
import { AppConfig } from '../../../config';
import CacheService from '../../../services/cache.service';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { TiersService } from '../../../services/tiers.service';
import { Bit2MeService } from '../../../services/bit2me.service';
import { BadRequestError } from '../../../errors/Errors';
import { InvoiceCompletedHandler } from '../../events/invoices/InvoiceCompletedHandler';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';
import { ObjectStorageWebhookHandler } from '../../events/ObjectStorageWebhookHandler';

export interface Bit2MePaymentStatusCallback {
  id: string;
  foreignId: string;
  cryptoAddress: {
    currency: string;
    address: string;
  };
  currencySent: {
    currency: string;
    amount: string;
    remainingAmount: string;
  };
  currencyReceived: {
    currency: string;
  };
  token: string;
  transactions: any[];
  fees: any[];
  error: any[];
  status: 'new' | 'pending' | 'confirming' | 'paid' | 'expired' | 'paid_after_expired';
}

export default function (
  stripe: Stripe,
  bit2MeService: Bit2MeService,
  storageService: StorageService,
  usersService: UsersService,
  paymentService: PaymentService,
  config: AppConfig,
  cacheService: CacheService,
  objectStorageService: ObjectStorageService,
  tiersService: TiersService,
) {
  return async function (fastify: FastifyInstance) {
    const decryptToken = async (token: string) => {
      return jwt.verify(token, config.JWT_SECRET) as {
        invoiceId: string;
        provider: string;
        customerId: string;
      };
    };

    fastify.post<{ Body: Bit2MePaymentStatusCallback }>('/webhook/crypto', async (req, rep) => {
      const { token, foreignId, status } = req.body;

      const { customerId, invoiceId, provider } = await decryptToken(token);

      if (invoiceId !== foreignId) {
        throw new BadRequestError('Stripe invoice id does not match');
      }

      if (status !== 'paid') {
        return rep.status(200).send();
      }

      const customer = await paymentService.getCustomer(customerId);
      if (customer.deleted) {
        throw new BadRequestError(`Customer with ID ${customerId} is deleted`);
      }

      const invoice = await stripe.invoices.retrieve(invoiceId);

      const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
      const objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService);
      const handler = new InvoiceCompletedHandler({
        logger: fastify.log,
        determineLifetimeConditions,
        objectStorageWebhookHandler,
        paymentService,
        cacheService,
        tiersService,
        storageService,
        usersService,
      });

      await handler.run({
        invoice,
        customer,
        status: invoice.status as string,
      });
    });
  };
}
