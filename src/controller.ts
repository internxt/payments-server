import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type AppConfig } from './config';
import { UserNotFoundError, UsersService } from './services/UsersService';
import { CouponCodeError, PaymentService, Reason } from './services/PaymentService';
import fastifyJwt from '@fastify/jwt';
import { User, UserSubscription } from './core/users/User';
import CacheService from './services/CacheService';
import Stripe from 'stripe';

export default function (
  paymentService: PaymentService,
  usersService: UsersService,
  config: AppConfig,
  cacheService: CacheService,
) {
  async function assertUser(req: FastifyRequest, rep: FastifyReply): Promise<User> {
    const { uuid } = req.user.payload;
    try {
      return await usersService.findUserByUuid(uuid);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        req.log.info(`User with uuid ${uuid} was not found`);
        return rep.status(404).send({ message: 'User not found' });
      }
      throw err;
    }
  }

  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        const config: { url?: string; method?: string } = request.context.config;
        if (config.url && config.url === '/prices' && config.method && config.method === 'GET') {
          return;
        }
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
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
        const { limit, starting_after: startingAfter } = req.query;

        const user = await assertUser(req, rep);

        const invoices = await paymentService.getInvoicesFromUser(user.customerId, { limit, startingAfter });

        const invoicesMapped = invoices
          .filter(
            (invoice) =>
              invoice.created && invoice.invoice_pdf && invoice.lines?.data?.[0]?.price?.metadata?.maxSpaceBytes,
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
      const user = await assertUser(req, rep);
      await usersService.cancelUserIndividualSubscriptions(user.customerId);

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

        const user = await assertUser(req, rep);
        await paymentService.updateSubscriptionPrice(user.customerId, priceId);

        const updatedSubscription = await paymentService.getUserSubscription(user.customerId);
        return rep.send(updatedSubscription);
      },
    );

    fastify.get('/setup-intent', async (req, rep) => {
      const user = await assertUser(req, rep);
      const { client_secret: clientSecret } = await paymentService.getSetupIntent(user.customerId);

      return { clientSecret };
    });

    fastify.get('/default-payment-method', async (req, rep) => {
      const user = await assertUser(req, rep);
      return paymentService.getDefaultPaymentMethod(user.customerId);
    });

    fastify.get('/subscriptions', async (req, rep) => {
      let response: UserSubscription;

      const user: User = await assertUser(req, rep);

      let subscriptionInCache: UserSubscription | null | undefined;
      try {
        subscriptionInCache = await cacheService.getSubscription(user.customerId);
      } catch (err) {
        req.log.error(`Error while trying to retrieve ${user.customerId} subscription from cache`);
        req.log.error(err);
      }

      if (subscriptionInCache) {
        req.log.info(`Cache hit for ${user.customerId} subscription`);
        return subscriptionInCache;
      }

      if (user.lifetime) {
        response = { type: 'lifetime' };
      } else {
        response = await paymentService.getUserSubscription(user.customerId);
      }

      cacheService.setSubscription(user.customerId, response).catch((err) => {
        req.log.error(`Error while trying to set subscription cache for ${user.customerId}`);
        req.log.error(err);
      });

      return response;
    });

    fastify.get('/prices', async (req, rep) => {
      return paymentService.getPrices();
    });

    fastify.get('/request-prevent-cancellation', async (req) => {
      const { uuid } = req.user.payload;
      try {
        const user = await usersService.findUserByUuid(uuid);

        return paymentService.isUserElegibleForTrial(user, {
          name: 'prevent-cancellation',
        });
      } catch (err) {
        const error = err as Error;
        req.log.error(
          `[REQUEST-PREVENT-CANCELLATION] ERROR for user ${uuid} ${error.message}. ${error.stack || 'NO STACK'}`,
        );
        throw err;
      }
    });

    fastify.put('/prevent-cancellation', async (req, rep) => {
      const { uuid } = req.user.payload;
      const user = await usersService.findUserByUuid(uuid);

      try {
        await paymentService.applyFreeTrialToUser(user, {
          name: 'prevent-cancellation',
        });
        return rep.status(200).send({ message: 'Coupon applied' });
      } catch (err) {
        if (err instanceof CouponCodeError) {
          return rep.status(403).send({ message: err.message });
        } else {
          req.log.error(err);
          return rep.status(500).send({ message: 'Internal server error' });
        }
      }
    });

    fastify.post<{
      Body: {
        price_id: string;
        success_url: string;
        coupon_code: string;
        cancel_url: string;
        customer_email: string;
        trial_days?: number;
        mode?: string;
      };
    }>(
      '/checkout-session',
      {
        schema: {
          body: {
            type: 'object',
            required: ['price_id', 'success_url', 'cancel_url', 'customer_email'],
            properties: {
              mode: { type: 'string' },
              price_id: { type: 'string' },
              trial_days: { type: 'number' },
              coupon_code: { type: 'string' },
              success_url: { type: 'string' },
              cancel_url: { type: 'string' },
              customer_email: { type: 'string' },
            },
          },
        },
      },
      async (req, rep) => {
        const { uuid } = req.user.payload;
        let user: User | undefined;
        try {
          user = await usersService.findUserByUuid(uuid);
        } catch (err) {
          req.log.info(`User with uuid ${uuid} not found in DB`);
        }
        const { id } = await paymentService.getCheckoutSession(
          req.body.price_id,
          req.body.success_url,
          req.body.cancel_url,
          user ?? req.body.customer_email,
          (req.body.mode as Stripe.Checkout.SessionCreateParams.Mode) || 'subscription',
          req.body.trial_days,
          req.body.coupon_code,
        );

        return { sessionId: id };
      },
    );
  };
}
