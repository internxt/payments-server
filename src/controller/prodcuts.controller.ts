import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { NotFoundSubscriptionError, PaymentService } from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';

const ALLOWED_SUBSCRIPTIONS = ['prod_123', 'prod_456'];

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
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

    fastify.get('/', {}, async (req, res): Promise<{ antivirus: boolean } | Error> => {
      const user = await assertUser(req, res, usersService);

      if (!user) throw new UserNotFoundError('User does not exist');

      const { customerId, lifetime } = user;

      const userSubscriptions = await paymentService.getActiveSubscriptions(customerId);
      const activeUserSubscription = userSubscriptions.find((subscription) => subscription.status === 'active');

      if (!activeUserSubscription && !lifetime) {
        throw new NotFoundSubscriptionError('User has no active subscriptions');
      }

      try {
        if (
          lifetime ||
          (activeUserSubscription?.product?.id && ALLOWED_SUBSCRIPTIONS.includes(activeUserSubscription?.product?.id))
        ) {
          return res.status(200).send({ antivirus: true });
        }

        return res.status(200).send({ antivirus: false });
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
