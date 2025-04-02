import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { NotFoundSubscriptionError } from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { TiersService } from '../services/tiers.service';
import { User } from '../core/users/User';

export default function (tiersService: TiersService, usersService: UsersService, config: AppConfig) {
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

    fastify.get(
      '/',
      async (req, res): Promise<{ featuresPerService: { antivirus: boolean; backups: boolean } } | Error> => {
        const userUuid = req.user.payload.uuid;
        let user: User;
        try {
          user = await usersService.findUserByUuid(userUuid);

          const { customerId, lifetime } = user;

          const isLifetimeUser = lifetime ?? false;

          const antivirusTier = await tiersService.getProductsTier(customerId, isLifetimeUser);

          return res.status(200).send(antivirusTier);
        } catch (error) {
          if (error instanceof UserNotFoundError || error instanceof NotFoundSubscriptionError) {
            return res.status(200).send({
              antivirus: false,
              backups: false,
            });
          }

          const userUuid = (user! && user.uuid) || 'unknown';

          req.log.error(`[PRODUCTS/GET]: Error ${(error as Error).message || error} for user ${userUuid}`);
          return res.status(500).send({ error: 'Internal server error' });
        }
      },
    );
  };
}
