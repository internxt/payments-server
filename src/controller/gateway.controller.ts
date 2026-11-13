import { FastifyInstance } from 'fastify';
import { NotFoundError } from '../errors/Errors';
import Logger from '../Logger';
import { Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { setupAuth } from '../plugins/auth';
import { LicenseCodeAlreadyAppliedError } from '../services/licenseCodes.service';
import { type Dependencies } from '../dependencies';

export function gatewayController({
  cacheService,
  usersService,
  licenseCodesService,
  userFeaturesOverridesService,
  config,
}: Pick<
  Dependencies,
  'cacheService' | 'usersService' | 'licenseCodesService' | 'userFeaturesOverridesService' | 'config'
>) {
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
                enum: [Service.Antivirus, Service.Backups, Service.Cleaner, Service.Cli, Service.rClone],
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

    fastify.post<{ Body: { code: string } }>(
      '/reactivate-license-code',
      {
        schema: {
          body: {
            type: 'object',
            required: ['code'],
            properties: {
              code: {
                type: 'string',
              },
            },
          },
        },
      },
      async (request, response) => {
        const { code } = request.body;

        await licenseCodesService.reactivateLicenseCode(code);

        return response.status(200).send();
      },
    );

    fastify.get<{ Querystring: { code: string; provider: string } }>(
      '/is-unique-code-available',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { code: { type: 'string' }, provider: { type: 'string' } },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res) => {
        const { code, provider } = req.query;

        const available = await licenseCodesService.isLicenseCodeAvailable(code, provider).catch((error) => {
          if (error instanceof LicenseCodeAlreadyAppliedError) {
            return false;
          }

          throw error;
        });
        return res.status(200).send({ available });
      },
    );
  };
}
