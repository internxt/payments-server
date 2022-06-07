import { FastifyInstance } from 'fastify';
import { type AppConfig } from './config';
import { UserNotFoundError, UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';
import fastifyJwt from '@fastify/jwt';
import { User, UserSubscription } from './core/users/User';
declare module 'fastify' {
  interface FastifyRequest {
    fullUser: User;
  }
}

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

    fastify.addHook('onRequest', async (req, rep) => {
      const { uuid } = req.user.payload;

      try {
        const user = await usersService.findUserByUuid(uuid);
        req.fullUser = user;
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          return rep.status(404).send({ message: 'User not found' });
        }
        throw err;
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
        const { limit, starting_after: startingAfter } = req.query;

        const invoices = await paymentService.getInvoicesFromUser(req.fullUser.customerId, { limit, startingAfter });

        const invoicesMapped = invoices
          .filter(
            (invoice) =>
              invoice.created && invoice.invoice_pdf && invoice.lines?.data?.at(0)?.price?.metadata?.maxSpaceBytes,
          )
          .map((invoice) => {
            return {
              id: invoice.id,
              created: invoice.created,
              pdf: invoice.invoice_pdf,
              bytesInPlan: invoice.lines.data[0].price!.metadata.maxSpaceBytes,
            };
          });

        return rep.send(invoicesMapped);
      },
    );

    fastify.delete('/subscriptions', async (req, rep) => {
      await usersService.cancelUserIndividualSubscriptions(req.fullUser.customerId);

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
        const { price_id: priceId } = req.body;

        const updatedSubscription = await paymentService.updateSubscriptionPrice(req.fullUser.customerId, priceId);

        return rep.send(updatedSubscription);
      },
    );

    fastify.get('/setup-intent', async (req, rep) => {
      const { client_secret: clientSecret } = await paymentService.getSetupIntent(req.fullUser.customerId);

      return { clientSecret };
    });

    fastify.get('/default-payment-method', async (req, rep) => {
      return paymentService.getDefaultPaymentMethod(req.fullUser.customerId);
    });

    fastify.get('/subscriptions', async (req, rep) => {
      let response: UserSubscription;

      if (req.fullUser.lifetime) {
        response = { type: 'lifetime' };
      } else {
        response = await paymentService.getUserSubscription(req.fullUser.customerId);
      }

      return response;
    });
  };
}
