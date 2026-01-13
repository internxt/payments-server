import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

import { StorageService } from '../../../services/storage.service';
import { UsersService } from '../../../services/users.service';
import { PaymentService } from '../../../services/payment.service';
import { AppConfig } from '../../../config';
import CacheService from '../../../services/cache.service';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { TiersService } from '../../../services/tiers.service';
import { BadRequestError } from '../../../errors/Errors';
import { InvoiceCompletedHandler } from '../../events/invoices/InvoiceCompletedHandler';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';
import Logger from '../../../Logger';

export interface CryptoWebhookDependencies {
  storageService: StorageService;
  cacheService: CacheService;
  config: AppConfig;
  objectStorageService: ObjectStorageService;
  paymentService: PaymentService;
  tiersService: TiersService;
  usersService: UsersService;
}

export interface CryptoWebhookTokenPayload {
  invoiceId: string;
  provider: string;
  customerId: string;
}

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

export default function ({
  storageService,
  cacheService,
  config,
  objectStorageService,
  paymentService,
  tiersService,
  usersService,
}: CryptoWebhookDependencies) {
  return async function (fastify: FastifyInstance) {
    const decodeToken = async (token: string): Promise<CryptoWebhookTokenPayload> => {
      return jwt.verify(token, config.JWT_SECRET) as CryptoWebhookTokenPayload;
    };

    fastify.post<{ Body: Bit2MePaymentStatusCallback }>('/webhook/crypto', async (req, rep) => {
      const { token, foreignId, status } = req.body;

      const { customerId, invoiceId: stripeInvoiceId, provider } = await decodeToken(token);

      Logger.info(
        `Received body: ${JSON.stringify(req.body)} for user ${customerId} and invoice ${stripeInvoiceId} with foreign id ${foreignId} and status ${status}`,
      );

      if (stripeInvoiceId !== foreignId) {
        throw new BadRequestError(
          `Stripe invoice with id ${stripeInvoiceId} and invoice foreign id ${foreignId} does not match for customer ${customerId}`,
        );
      }

      if (provider !== 'stripe') {
        throw new BadRequestError(
          `The provider for the invoice with ID ${stripeInvoiceId} and foreign Id ${foreignId} for customer Id ${customerId} is not Stripe.`,
        );
      }

      const isPaid = status === 'paid_after_expired' || status === 'paid';
      if (!isPaid) {
        Logger.info(`Invoice ${stripeInvoiceId} for customer ${customerId} is not paid. Status: ${status}`);
        return rep.status(200).send();
      }

      const customer = await paymentService.getCustomer(customerId);
      if (customer.deleted) {
        throw new BadRequestError(`Customer with ID ${customerId} is deleted`);
      }

      await paymentService.markInvoiceAsPaid(stripeInvoiceId);

      Logger.info(`Invoice marked as paid for customer ${customerId} and invoice ${stripeInvoiceId}`);

      const invoice = await paymentService.getInvoice(stripeInvoiceId);

      const determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);

      const handler = new InvoiceCompletedHandler({
        logger: fastify.log,
        determineLifetimeConditions,
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

      Logger.info(
        `Invoice completed handler executed successfully for customer ${customerId} and invoice ${stripeInvoiceId}`,
      );

      return rep.status(200).send();
    });
  };
}
