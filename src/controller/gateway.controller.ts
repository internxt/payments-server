import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { UsersService } from '../services/users.service';
import { NotFoundError } from '../errors/Errors';
import Logger from '../Logger';
import CacheService from '../services/cache.service';
import { Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeaturesOverridesService } from '../services/userFeaturesOverride.service';
import { setupAuth } from '../plugins/auth';

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
    await setupAuth(fastify, {
      jwtOptions: {
        algorithms: ['RS256'],
      },
      secret: {
        public: Buffer.from(config.PAYMENTS_GATEWAY_PUBLIC_SECRET, 'base64').toString('utf-8'),
      },
    });

    fastify.post<{ Body: { feature: Service; userUuid: string } }>(
      '/activate',
      {
        schema: {
          body: {
            type: 'object',
            required: ['userUuid', 'feature'],
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
