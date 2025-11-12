import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { UsersService } from '../services/users.service';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import { NotFoundError, UnauthorizedError } from '../errors/Errors';
import Logger from '../Logger';
import CacheService from '../services/cache.service';
import { Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeaturesOverridesService } from '../services/userFeaturesOverride.service';

interface GatewayControllerPayload {
  cacheService: CacheService;
  usersService: UsersService;
  userFeaturesOverridesService: UserFeaturesOverridesService;
  config: AppConfig;
}

export function gatewayController({
  cacheService,
  usersService,
  userFeaturesOverridesService,
  config,
}: GatewayControllerPayload) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, {
      secret: {
        public: Buffer.from(config.PAYMENTS_GATEWAY_PUBLIC_SECRET, 'base64').toString('utf-8'),
      },
      verify: {
        algorithms: ['RS256'],
      },
    });

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
                enum: [Service.Antivirus, Service.Backups, Service.Cleaner, Service.Cli],
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
