import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../errors/Errors';
import config from '../config';

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

    fastify.addHook('onRequest', async (request, _) => {
      try {
        await request.jwtVerify();
      } catch (err) {
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

        const userExists = await usersService.findUserByUuid(userUuid).catch(() => null);

        if (userExists) {
          customerId = userExists.customerId;
        } else {
          const { id } = await paymentsService.createCustomer({ name, email });
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

        if (!customerId || !priceId) {
          throw new BadRequestError('The following parameters are mandatory: customerId and priceId');
        }

        const { customerId: tokenCustomerId } = jwt.verify(token, config.JWT_SECRET) as {
          customerId: string;
        };

        if (customerId !== tokenCustomerId) {
          throw new ForbiddenError();
        }

        const subscriptionAttempt = await paymentsService.createSubscription({
          customerId,
          priceId,
          currency,
          seatsForBusinessSubscription: quantity ?? 1,
          promoCodeId,
        });

        return res.status(200).send(subscriptionAttempt);
      },
    );
  };
}
