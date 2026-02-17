import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { ProductsService } from '../services/products.service';
import Logger from '../Logger';
import { Tier } from '../core/users/Tier';
import CacheService from '../services/cache.service';
import { setupAuth } from '../plugins/auth';

export function productsController(productsService: ProductsService, config: AppConfig, cacheService?: CacheService) {
  return async function (fastify: FastifyInstance) {
    await setupAuth(fastify, {
      secret: config.JWT_SECRET,
      rateLimit: {
        timeWindow: '1 minute',
        max: 20,
      },
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
        try {
          const cachedUserTier = await cacheService?.getUserTier(userUuid);

          if (cachedUserTier) {
            return rep.status(200).send(cachedUserTier);
          }
        } catch (cacheError) {
         Logger.error(`[TIER PRODUCT/CACHE_READ_ERROR]: ${(cacheError as Error).message || cacheError} for user ${userUuid}`);
        }

        const mergedFeatures = await productsService.getApplicableTierForUser({
          userUuid,
          ownersId,
        });

        try {
          await cacheService?.setUserTier(userUuid, mergedFeatures);
        } catch (cacheError) {
          Logger.error(`[TIER PRODUCT/CACHE_WRITE_ERROR]: ${(cacheError as Error).message || cacheError} for user ${userUuid}`);
        }

        return rep.status(200).send(mergedFeatures);
      } catch (error) {
        Logger.error(`[TIER PRODUCT/ERROR]: ${(error as Error).message || error} for user ${userUuid}`);
        return rep.status(500).send({ message: 'Internal server error' });
      }
    });
  };
}
