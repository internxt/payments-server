import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

import { StorageService } from '../../../services/storage.service';
import { UserNotFoundError, UsersService } from '../../../services/users.service';
import { PaymentService } from '../../../services/payment.service';
import { AppConfig } from '../../../config';
import CacheService from '../../../services/cache.service';
import { ObjectStorageService } from '../../../services/objectStorage.service';
import { TiersService } from '../../../services/tiers.service';
import { Bit2MeService } from '../../../services/bit2me.service';
import { BadRequestError } from '../../../errors/Errors';

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
        stripeInvoiceId: string;
        customerId: string;
      };
    };

    fastify.post<{ Body: Bit2MePaymentStatusCallback }>('/webhook/crypto', async (req, rep) => {
      const { token, foreignId, status } = req.body;

      const { customerId, stripeInvoiceId } = await decryptToken(token);

      if (stripeInvoiceId !== foreignId) {
        throw new BadRequestError('Stripe invoice id does not match');
      }

      if (status !== 'paid') {
        return rep.status(200).send();
      }

      // Get user uuid and all necessary info to complete the following steps
      const customer = await paymentService.getCustomer(customerId);
      if (customer.deleted) {
        throw new BadRequestError(`Customer with ID ${customerId} is deleted`);
      }

      const customerEmail = customer.email;

      const invoiceLineItem = await paymentService.getInvoiceLineItems(stripeInvoiceId);
      const isLifetime = invoiceLineItem.data[0].price?.type === 'one_time';

      if (!customerEmail) {
        throw new BadRequestError(`Customer email not found for customer ID ${customerId}`);
      }

      const {
        data: { uuid: userUuid },
      } = await usersService.findUserByEmail(customerEmail.toLowerCase());

      // insert/update user
      try {
        await usersService.updateUser(customerId, {
          lifetime: isLifetime,
          uuid: userUuid,
        });
      } catch (error) {
        if (error instanceof UserNotFoundError) {
          await usersService.insertUser({
            customerId,
            uuid: userUuid,
            lifetime: isLifetime,
          });
        }

        throw error;
      }

      // Apply features (old/new products)

      // insert/update user-tier relationship

      // Clear cache (subscription and used codes)
    });
  };
}
