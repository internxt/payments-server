import Stripe from 'stripe';
import { FastifyInstance } from 'fastify';
import fastifyLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import { type AppConfig } from './config';
import { UsersService } from './services/users.service';
import { PaymentService } from './services/payment.service';
import { User } from './core/users/User';
import { assertUser } from './utils/assertUser';
import Logger from './Logger';

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
          const pricesMap = new Map();

          for (const invoice of invoices) {
            const priceId = invoice.lines?.data?.[0]?.pricing?.price_details?.price;
            if (priceId && !pricesMap.has(priceId)) {
              const price = await paymentService.getPrice(priceId);
              pricesMap.set(priceId, price);
            }
          }

          const oneTimePurchases = invoices
            .filter((invoice): invoice is Stripe.Invoice => {
              const priceId = invoice.lines?.data?.[0]?.pricing?.price_details?.price;
              if (!priceId) return false;

              const price = pricesMap.get(priceId);

              return invoice.status === 'paid' && !invoice.lines.data[0].subscription && price?.type === 'one_time';
            })
            .map((invoice) => ({
              price: invoice.lines.data[0].pricing?.price_details?.price as string,
              productId: invoice.lines.data[0].pricing?.price_details?.product as string,
            }))
            .filter((purchase) => purchase.price && purchase.productId);

          if (oneTimePurchases.length === 0) {
            Logger.info(`There is no one-time purchase for user with uuid: ${user.uuid}`);
            return;
          }

          response = {
            planId: oneTimePurchases[0].productId,
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
        const subscription = await paymentService.getUserSubscription(user.customerId);
        if (subscription.type !== 'subscription') {
          Logger.info(`There is no subscription for user with uuid: ${user.uuid}`);
          return;
        }

        response = {
          planId: subscription.productId as string,
          type: subscription.type,
          uuid: user.uuid,
        };
      }

      return response;
    });
  };
}
