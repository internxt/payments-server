import { FastifyInstance } from 'fastify';
import { type AppConfig } from './config';
import { UserNotFoundError, UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';
import fastifyJwt from '@fastify/jwt';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        fastify.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
      }
    });

    fastify.get<{ Querystring: { limit: number; starting_after?: string } }>(
      '/invoices',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { limit: { type: 'number', default: 10 }, starting_after: { type: 'string' } },
          },
        },
      },
      async (req, rep) => {
        const { uuid } = req.user.payload;

        let customerId: string;
        try {
          const user = await usersService.findUserByUuid(uuid);
          customerId = user.customerId;
        } catch (err) {
          if (err instanceof UserNotFoundError) {
            return rep.status(404).send({ message: 'User not found' });
          }
          throw err;
        }

        const { limit, starting_after: startingAfter } = req.query;

        const invoices = await paymentService.getInvoicesFromUser(customerId, { limit, startingAfter });

        return rep.send(invoices);
      },
    );

    fastify.delete('/subscriptions', async (req, rep) => {
      const { uuid } = req.user.payload;
      await usersService.cancelUserIndividualSubscriptions(uuid);

      return rep.status(204).send();
    });

    fastify.put<{ Body: { price_id: string } }>(
      '/subscriptions',
      {
        schema: {
          body: {
            type: 'object',
            required: ['price_id'],
            properties: { price_id: { type: 'string' } },
          },
        },
      },
      async (req, rep) => {
        const { uuid } = req.user.payload;

        let customerId: string;
        try {
          const user = await usersService.findUserByUuid(uuid);
          customerId = user.customerId;
        } catch (err) {
          if (err instanceof UserNotFoundError) {
            return rep.status(404).send({ message: 'User not found' });
          }
          throw err;
        }

        const { price_id: priceId } = req.body;

        const updatedSubscription = await paymentService.updateSubscriptionPrice(customerId, priceId);

        return rep.send(updatedSubscription);
      },
    );
  };
}
