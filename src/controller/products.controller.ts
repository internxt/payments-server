import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { NotFoundSubscriptionError, PaymentService } from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { TiersService } from '../services/tiers.service';
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

        if (userSubscription.type === 'free')
          throw new NotFoundSubscriptionError('User does not have any subscription nor lifetime plan');

        const productId = await paymentService.fetchUserProductId(customerId, lifetime);

        const tierProducts = await tiersService.getTierProductsByProductsId(productId, userSubscription.type);

        return res.status(200).send(tierProducts);
      } catch (error) {
        if (error instanceof UserNotFoundError || error instanceof NotFoundSubscriptionError) {
          return res.status(404).send({ error: error.message });
        }

        req.log.error(`Error while checking user subscription products: ${(error as Error).message}`);
        return res.status(500).send({ error: 'Internal server error' });
      }
    });
  };
}
