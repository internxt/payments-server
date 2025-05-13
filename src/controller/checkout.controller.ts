import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../errors/Errors';
import config from '../config';
import { fetchUserStorage } from '../utils/fetchUserStorage';

function signUserToken(customerId: string) {
  return jwt.sign({ customerId }, config.JWT_SECRET);
}

export default function (usersService: UsersService, paymentsService: PaymentService) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyRateLimit, {
      max: 1000,
      timeWindow: '1 minute',
    });

    fastify.addHook('onRequest', async (request) => {
      const skipAuth = request.routeOptions?.config?.skipAuth;
      const allowAnonymous = request.routeOptions?.config?.allowAnonymous;

      if (skipAuth) {
        return;
      }
      try {
        await request.jwtVerify();
      } catch (err) {
        if (allowAnonymous) {
          return;
        }
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        throw new UnauthorizedError();
      }
    });

    fastify.get<{ Querystring: { country: string; companyVatId: string } }>(
      '/customer',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              country: { type: 'string' },
              companyVatId: { type: 'string' },
            },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, res): Promise<{ customerId: string; token: string }> => {
        let customerId: Stripe.Customer['id'];
        const { country, companyVatId } = req.query;
        const { uuid: userUuid, email, name } = req.user.payload;
        const userIpAddress = (req.headers['X-Real-Ip'] as string) ?? (req.headers['x-real-ip'] as string);

        const userExists = await usersService.findUserByUuid(userUuid).catch(() => null);

        if (userExists) {
          customerId = userExists.customerId;
        } else {
          const { id } = await paymentsService.createCustomer({
            name,
            email,
            tax: {
              ip_address: userIpAddress,
              validate_location: 'immediately',
            },
          });
          customerId = id;
        }

        if (country && companyVatId) {
          await paymentsService.getVatIdAndAttachTaxIdToCustomer(customerId, country, companyVatId);
        }

        return res.send({ customerId, token: signUserToken(customerId) });
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        token: string;
        currency?: string;
        promoCodeId?: string;
        quantity?: number;
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
              quantity: {
                type: 'number',
              },
            },
          },
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, promoCodeId, quantity, token } = req.body;
        let tokenCustomerId;

        try {
          const { customerId } = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          tokenCustomerId = customerId;
        } catch {
          throw new ForbiddenError();
        }

        if (customerId !== tokenCustomerId) {
          throw new ForbiddenError();
        }

        const subscriptionAttempt = await paymentsService.createSubscription({
          customerId,
          priceId,
          currency,
          seatsForBusinessSubscription: quantity ?? 1,
          promoCodeId,
          additionalOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });

        return res.status(200).send(subscriptionAttempt);
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        token: string;
        currency?: string;
        promoCodeId?: string;
      };
    }>(
      '/payment-intent',
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
      },
      async (req, res) => {
        let tokenCustomerId: string;
        const { uuid, email } = req.user.payload;
        const { customerId, priceId, token, currency, promoCodeId } = req.body;

        try {
          const { customerId } = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          tokenCustomerId = customerId;
        } catch {
          throw new ForbiddenError();
        }

        if (customerId !== tokenCustomerId) {
          throw new ForbiddenError();
        }

        const price = await paymentsService.getPriceById(priceId);
        const { canExpand: isStorageUpgradeAllowed } = await fetchUserStorage(uuid, email, price.bytes.toString());

        if (!isStorageUpgradeAllowed) {
          throw new BadRequestError('The user already has the maximum storage allowed');
        }

        const { clientSecret, id, invoiceStatus } = await paymentsService.createInvoice({
          customerId,
          priceId,
          currency,
          promoCodeId,
          additionalInvoiceOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });

        return res.status(200).send({ clientSecret, id, invoiceStatus });
      },
    );

    fastify.get<{
      Querystring: {
        priceId: string;
        currency?: string;
        promoCodeName?: string;
        postalCode?: string;
        country?: string;
      };
    }>(
      '/price-by-id',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['priceId'],
            properties: {
              priceId: { type: 'string', description: 'Price ID to fetch' },
              currency: { type: 'string', description: 'Optional currency for the price', default: 'eur' },
              promoCodeName: {
                type: 'string',
                description: 'Optional coupon code name to apply to the price',
              },
              postalCode: {
                type: 'string',
                description: 'Optional postal code for tax calculation',
              },
              country: {
                type: 'string',
                description: 'Optional country for tax calculation',
              },
            },
          },
        },
        config: {
          allowAnonymous: true,
        },
      },
      async (req, res) => {
        const { priceId, currency, promoCodeName, postalCode, country } = req.query;
        const userIp = (req.headers['X-Real-Ip'] as string) ?? (req.headers['x-real-ip'] as string);

        const userUuid = req.user?.payload?.uuid;
        const user = await usersService.findUserByUuid(userUuid).catch(() => null);

        const price = await paymentsService.getPriceById(priceId, currency);
        let amount = price.amount;

        if (promoCodeName) {
          const couponCode = await paymentsService.getPromoCodeByName(price.product, promoCodeName);
          if (couponCode.amountOff) {
            amount = price.amount - couponCode.amountOff;
          } else if (couponCode.percentOff) {
            const percentDiscount = 100 - couponCode.percentOff;
            const discount = (price.amount * percentDiscount) / 100;
            amount = discount;
            price.amount = discount;
            price.decimalAmount = discount / 100;
          }
        }

        const taxForPrice = await paymentsService.calculateTax(
          priceId,
          amount,
          userIp,
          currency,
          user?.customerId,
          postalCode,
          country,
        );

        return res.status(200).send({
          ...price,
          tax: taxForPrice.tax_amount_exclusive,
          decimalTax: taxForPrice.tax_amount_exclusive / 100,
          amountWithTax: taxForPrice.amount_total,
          decimalAmountWithTax: taxForPrice.amount_total / 100,
        });
      },
    );
  };
}
