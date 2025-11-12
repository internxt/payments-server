import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { UsersService } from '../services/users.service';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { NotFoundError, UnauthorizedError } from '../errors/Errors';
import Logger from '../Logger';
import CacheService from '../services/cache.service';
import { ProductsService } from '../services/products.service';
import { Service, Tier } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeaturesOverridesService } from '../services/userFeaturesOverride.service';

export function gatewayController(
  productsService: ProductsService,
  cacheService: CacheService,
  usersService: UsersService,
  userFeaturesOverridesService: UserFeaturesOverridesService,
  config: AppConfig,
) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.GATEWAY_JWT_SECRET });
    fastify.register(fastifyLimit, {
      max: 20,
      timeWindow: '1 minute',
    });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        Logger.warn(`JWT verification failed with error: ${(err as Error).message}`);
        throw new UnauthorizedError();
      }
    });

    fastify.get('/tier', async (req, rep): Promise<Tier> => {
      const userUuid = req.user.payload.uuid;
      const ownersId = req.user.payload.workspaces?.owners ?? [];

      const cachedUserTier = await cacheService.getUserTier(userUuid);

      if (cachedUserTier) {
        return rep.status(200).send(cachedUserTier);
      }

      const mergedFeatures = await productsService.getApplicableTierForUser({
        userUuid,
        ownersId,
      });

      await cacheService.setUserTier(userUuid, mergedFeatures);

      return rep.status(200).send(mergedFeatures);
    });

    fastify.post<{ Body: { feature: Service; userUuid: string } }>(
      '/activate',
      {
        schema: {
          body: {
            type: 'object',
            required: ['feature'],
            properties: {
              feature: {
                type: 'string',
                enum: [...Object.values(Service), 'cli'] as const,
              },
              userUuid: {
                type: 'string',
              },
            },
          },
        },
      },
      async (request, response) => {
        let user: User;
        const { feature, userUuid } = request.body;

        try {
          user = await usersService.findUserByUuid(userUuid);
        } catch (error) {
          Logger.error(`[PRODUCTS/ACTIVATE]: Error ${(error as Error).message} for user ${userUuid}`);
          throw new NotFoundError(`User with uuid ${userUuid} was not found`);
        }

        await userFeaturesOverridesService.upsertCustomUserFeatures(user, feature);
        await cacheService.clearUserTier(userUuid);

        return response.status(204).send();
      },
    );
  };
}
