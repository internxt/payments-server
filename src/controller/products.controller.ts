import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { ProductsService } from '../services/products.service';
import Logger from '../Logger';
import { Service, Tier } from '../core/users/Tier';
import CacheService from '../services/cache.service';
import { UserFeaturesOverridesService } from '../services/userFeaturesOverride.service';
import { UsersService } from '../services/users.service';

export function productsController(
  productsService: ProductsService,
  userFeaturesOverridesService: UserFeaturesOverridesService,
  usersService: UsersService,
  cacheService: CacheService,
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
        const userUuid = req.user.payload.uuid;
        const ownersId = req.user.payload.workspaces?.owners ?? [];

        try {
          const mergedFeatures = await productsService.getApplicableTierForUser({
            userUuid,
            ownersId,
          });

          const antivirusEnabled = mergedFeatures.featuresPerService.antivirus.enabled;
          const backupsEnabled = mergedFeatures.featuresPerService.backups.enabled;

          return res.status(200).send({
            featuresPerService: {
              antivirus: antivirusEnabled,
              backups: backupsEnabled,
            },
          });
        } catch (error) {
          Logger.error(`[PRODUCTS/GET]: Error ${(error as Error).message} for user ${userUuid}`);
          return res.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    fastify.get('/tier', async (req, rep): Promise<Tier> => {
      const userUuid = req.user.payload.uuid;
      const ownersId = req.user.payload.workspaces?.owners ?? [];

      try {
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
      } catch (error) {
        Logger.error(`[TIER PRODUCT/ERROR]: ${(error as Error).message || error} for user ${userUuid}`);
        return rep.status(500).send({ message: 'Internal server error' });
      }
    });

    fastify.post<{ Body: { feature: Service } }>(
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
            },
          },
        },
      },
      async (request, response) => {
        const { feature } = request.body;
        const userUuid = request.user?.payload?.uuid;

        await userFeaturesOverridesService.upsertCustomUserFeatures(userUuid, feature);
        await cacheService.clearUserTier(userUuid);

        return response.status(204).send();
      },
    );
  };
}
