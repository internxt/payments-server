import { FastifyInstance } from 'fastify';
import { type AppConfig } from './config';
import { UsersService } from './services/users.service';
import { PaymentService } from './services/payment.service';
import fastifyJwt from '@fastify/jwt';
import { User } from './core/users/User';
import { assertUser } from './utils/assertUser';
import fastifyLimit from '@fastify/rate-limit';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyLimit, {
      max: 30,
      timeWindow: '1 second',
    });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
      }
    });

    fastify.get('/get-user-subscription', async (req, rep) => {
      let response: { planId: string; type: string; uuid: string };

      const user: User = await assertUser(req, rep, usersService);

      if (user.lifetime) {
        const invoices = await paymentService.getInvoicesFromUser(user.customerId, { limit: 100 });

        if (invoices.length > 0) {
          const oneTimePurchases = invoices
            .filter(
              (invoice) => invoice.paid && !invoice.subscription && invoice?.lines?.data[0]?.price?.type === 'one_time',
            )
            .map((invoice) => ({ price: invoice.lines.data[0].price, planId: invoice.lines.data[0].price?.product }));
          response = {
            planId: oneTimePurchases[0].planId as string,
            type: 'lifetime',
            uuid: user.uuid,
          };
        } else {
          const planId = await paymentService.getPlanIdFromLastPayment(user.customerId, { limit: 100 });

          if (!planId) {
            throw new Error('Unable to find planId');
          }
          response = {
            planId: planId,
            type: 'lifetime',
            uuid: user.uuid,
          };
        }
      } else {
        const subscription = (await paymentService.getUserSubscription(user.customerId)) as any;
        response = {
          planId: subscription.planId,
          type: subscription.type,
          uuid: user.uuid,
        };
      }

      return response;
    });
  };
}
