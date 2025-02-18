import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { NotFoundSubscriptionError, PaymentService } from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { UserType } from '../core/users/User';
import { Tier } from '../core/users/MongoDBTiersRepository';

export default function (
  paymentService: PaymentService,
  tiersService: TiersService,
  usersService: UsersService,
  config: AppConfig,
) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyLimit, {
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

    fastify.get<{
      Querystring: { userType?: UserType };
      schema: {
        querystring: {
          type: 'object';
          properties: { userType: { type: 'string' } };
        };
      };
    }>('/', async (req, res): Promise<Tier | Error> => {
      try {
        const { userType } = req.query;
        const user = await assertUser(req, res, usersService);
        const { customerId, lifetime } = user;

        const userSubscription = await paymentService.getUserSubscription(customerId, userType);

        if (userSubscription.type === 'free' && !lifetime) {
          throw new NotFoundSubscriptionError('User does not have any subscription nor lifetime plan');
        }

        let productId: string;
        let tierProducts: Tier;

        if (lifetime) userSubscription.type = 'lifetime';

        switch (userSubscription.type) {
          case 'subscription':
            productId = userSubscription.plan.productId;
            tierProducts = await tiersService.getTierProductsByProductsId(productId, 'subscription');
            break;

          case 'lifetime':
            productId = await paymentService.fetchUserLifetimeProductId(customerId);
            tierProducts = await tiersService.getTierProductsByProductsId(productId, 'lifetime');
            break;

          default:
            throw new NotFoundSubscriptionError(`Subscription not found`);
        }

        return res.send(tierProducts);
      } catch (error) {
        req.log.error(
          `Error while checking user subscription products: ${error instanceof Error ? error.message : String(error)}`,
        );

        if (
          error instanceof UserNotFoundError ||
          error instanceof NotFoundSubscriptionError ||
          error instanceof TierNotFoundError
        ) {
          res.status(404);
        } else {
          res.status(500);
        }

        return res.send({ error: (error as Error).message });
      }
    });
  };
}
