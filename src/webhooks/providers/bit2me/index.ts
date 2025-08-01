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
import { ObjectStorageWebhookHandler } from '../../events/ObjectStorageWebhookHandler';

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
    const decryptToken = async (token: string): Promise<CryptoWebhookTokenPayload> => {
      return jwt.verify(token, config.JWT_SECRET) as CryptoWebhookTokenPayload;
    };

    fastify.post<{ Body: Bit2MePaymentStatusCallback }>('/webhook/crypto', async (req, rep) => {
      const { token, foreignId, status } = req.body;

      const { customerId, invoiceId, provider } = await decryptToken(token);

      if (invoiceId !== foreignId) {
        throw new BadRequestError(
          `Stripe invoice with id ${invoiceId} and invoice foreign id ${foreignId} does not match for customer ${customerId}`,
        );
      }

      if (provider !== 'stripe') {
        throw new BadRequestError(
          `The provider for the invoice with ID ${invoiceId} and foreign Id ${foreignId} for customer Id ${customerId} is not Stripe.`,
        );
      }

      if (status !== 'paid') {
        return rep.status(200).send();
      }

      const customer = await paymentService.getCustomer(customerId);
      if (customer.deleted) {
        throw new BadRequestError(`Customer with ID ${customerId} is deleted`);
      }

      const invoice = await paymentService.getInvoice(invoiceId);

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

      await paymentService.updateInvoice(invoiceId, {
        metadata: {
          provider: 'bit2me',
        },
        description: 'Invoice paid using crypto currencies.',
      });

      await paymentService.markInvoiceAsPaid(invoiceId);

      return rep.status(200).send();
    });
  };
}
