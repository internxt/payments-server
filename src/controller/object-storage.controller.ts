import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

import {
  CustomerNotFoundError,
  ExistingSubscriptionError,
  NotFoundPlanByIdError,
  PaymentService,
} from '../services/payment.service';
import { ForbiddenError, UnauthorizedError } from '../errors/Errors';
import config from '../config';
import Stripe from 'stripe';
import { withAuth } from '../plugins/withAuth.plugin';

function signUserToken(customerId: string) {
  return jwt.sign({ customerId }, config.JWT_SECRET);
}

export function objectStorageController(paymentService: PaymentService) {
  return async function (fastify: FastifyInstance) {
    await withAuth(fastify, { secret: config.JWT_SECRET });

    fastify.get<{
      Querystring: { email: string; customerName: string; country: string; postalCode: string; companyVatId?: string };
    }>(
      '/customer',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['email', 'customerName', 'country', 'postalCode'],
            properties: {
              email: { type: 'string' },
              customerName: { type: 'string' },
              country: { type: 'string' },
              postalCode: { type: 'string' },
              companyVatId: { type: 'string' },
            },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
          },
          skipAuth: true,
        },
      },
      async (req, res) => {
        let customerId: Stripe.Customer['id'];
        const { email, customerName, country, postalCode, companyVatId } = req.query;

        const userExists = await paymentService.getCustomerIdByEmail(email).catch((err) => {
          if (err instanceof CustomerNotFoundError) {
            return null;
          }

          throw err;
        });

        if (userExists) {
          customerId = userExists.id;
        } else {
          const { id } = await paymentService.createCustomer({
            name: customerName,
            email,
            address: {
              country,
              postal_code: postalCode,
            },
          });

          if (country && companyVatId) {
            await paymentService.getVatIdAndAttachTaxIdToCustomer(id, country, companyVatId);
          }

          customerId = id;
        }

        return res.send({ customerId, token: signUserToken(customerId) });
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        currency: string;
        token: string;
        promoCodeId?: string;
      };
    }>(
      '/subscription',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId', 'token'],
            properties: {
              customerId: {
                type: 'string',
              },
              priceId: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              currency: {
                type: 'string',
              },
              promoCodeId: {
                type: 'string',
              },
            },
          },
        },
        config: {
          skipAuth: true,
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, token, promoCodeId } = req.body;

        try {
          const payload = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          const tokenCustomerId = payload.customerId;

          if (customerId !== tokenCustomerId) {
            throw new ForbiddenError();
          }
        } catch {
          throw new ForbiddenError();
        }

        try {
          const createdSubscription = await paymentService.createSubscription({
            customerId,
            priceId,
            currency,
            promoCodeId,
            additionalOptions: {
              automatic_tax: {
                enabled: true,
              },
            },
          });

          return res.send(createdSubscription);
        } catch (err) {
          const error = err as Error;
          if (error instanceof ExistingSubscriptionError) {
            return res.status(409).send({
              message: error.message,
            });
          }

          req.log.error(`[ERROR CREATING SUBSCRIPTION]: ${error.stack ?? error.message}`);

          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );

    fastify.get<{
      Querystring: { planId: string; currency?: string };
    }>(
      '/price',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { planId: { type: 'string' }, currency: { type: 'string' } },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
          skipAuth: true,
        },
      },
      async (req, rep) => {
        const { planId, currency } = req.query;

        try {
          const planObject = await paymentService.getObjectStoragePlanById(planId, currency);

          return rep.status(200).send(planObject);
        } catch (error) {
          const err = error as Error;
          if (err instanceof NotFoundPlanByIdError) {
            return rep.status(404).send({ message: err.message });
          }

          req.log.error(`[ERROR WHILE FETCHING PLAN BY ID]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
          return rep.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    fastify.get('/invoices', async (req, res) => {
      const { customerId } = req.user;

      if (!customerId) {
        throw new UnauthorizedError('Customer ID is required');
      }

      const userInvoices = await paymentService.getInvoicesFromUser(customerId, {});

      if (userInvoices.length === 0) {
        return res.status(200).send([]);
      }

      const productPromises = userInvoices
        .map((invoice) => invoice.lines.data[0]?.price?.product)
        .filter(Boolean)
        .map((productId) => paymentService.getProduct(productId as string));

      const productDetails = await Promise.all(productPromises);

      const objectStorageProduct = productDetails.find((product) => product.metadata?.type === 'object-storage');

      const objectStorageInvoices = userInvoices
        .filter((invoice) => invoice.lines.data[0].price?.product === objectStorageProduct?.id)
        .map((invoice) => ({
          id: invoice.id,
          created: invoice.created,
          pdf: invoice.invoice_pdf,
          total: invoice.total,
          product: invoice.lines.data[0].price?.product,
        }));

      return res.status(200).send(objectStorageInvoices);
    });
  };
}
