import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import config from '../config';
import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';

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

    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
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
        const { country, companyVatId } = req.query;
        const { uuid: userUuid, email, name } = req.user.payload;

        const userExists = await usersService.findUserByUuid(userUuid).catch(() => null);

        if (userExists) {
          const { customerId } = userExists;
          return res.send({ customerId: customerId, token: signUserToken(customerId) });
        }

        const { id: customerId } = await paymentsService.createCustomer({ name, email });

        if (country && companyVatId) {
          await paymentsService.getVatIdAndAttachTaxIdToCustomer(customerId, country, companyVatId);
        }

        return res.send({ customerId, token: signUserToken(customerId) });
      },
    );
  };
}
