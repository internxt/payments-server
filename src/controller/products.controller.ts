import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppConfig } from '../config';
import { NotFoundSubscriptionError } from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { TierNotFoundError, TiersService } from '../services/tiers.service';
import { User, UserType } from '../core/users/User';
import { ProductsService } from '../services/products.service';

export default function (
  tiersService: TiersService,
  usersService: UsersService,
  productsService: ProductsService,
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

    fastify.get(
      '/',
      async (req, res): Promise<{ featuresPerService: { antivirus: boolean; backups: boolean } } | Error> => {
        let user: User;
        try {
          user = await assertUser(req, res, usersService);

          if (!user) throw new UserNotFoundError('User does not exist');

          const { customerId, lifetime } = user;

          const isLifetimeUser = lifetime ?? false;

          const antivirusTier = await tiersService.getProductsTier(customerId, isLifetimeUser);

          return res.status(200).send(antivirusTier);
        } catch (error) {
          if (error instanceof UserNotFoundError || error instanceof NotFoundSubscriptionError) {
            return res.status(404).send({ error: error.message });
          }

          const userUuid = (user! && user.uuid) || 'unknown';

          req.log.error(`[PRODUCTS/GET]: Error ${(error as Error).message || error} for user ${userUuid}`);
          return res.status(500).send({ error: 'Internal server error' });
        }
      },
    );

    fastify.get('/tier', async (req: FastifyRequest, rep: FastifyReply) => {
      console.log(req.user);
      const userUuid = req.user.payload.uuid;
      const ownersId = req.user.payload.workspaces.owners;

      try {
        const higherTier = await productsService.findHigherTierForUser({
          userUuid,
          ownersId,
          subscriptionType: UserType.Individual,
        });

        return rep.status(200).send(higherTier);
      } catch (error) {
        req.log.error(`[TIER PRODUCT/ERROR]: ${(error as Error).message || error} for user ${userUuid}`);
        if (error instanceof UserNotFoundError || error instanceof TierNotFoundError) {
          const freeTier = await tiersService.getTierProductsByProductsId('free');
          return rep.status(200).send(freeTier);
        }

        return rep.status(500).send({ message: 'Internal server error' });
      }
    });
  };
}
