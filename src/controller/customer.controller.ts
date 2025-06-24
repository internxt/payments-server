import { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import { UsersService } from '../services/users.service';
import { UnauthorizedError } from '../errors/Errors';
import config from '../config';
import CacheService from '../services/cache.service';
import { PaymentService } from '../services/payment.service';

export default function (usersService: UsersService, paymentService: PaymentService, cacheService: CacheService) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyRateLimit, {
      max: 1000,
      timeWindow: '1 minute',
    });

    fastify.addHook('onRequest', async (request) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        throw new UnauthorizedError();
      }
    });

    fastify.get(
      '/redeemed-promotion-codes',
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res): Promise<{ usedCoupons: string[] }> => {
        const { uuid } = req.user.payload;
        const user = await usersService.findUserByUuid(uuid);

        try {
          const cachedCoupons = await cacheService.getUsedUserPromoCodes(user.customerId);

          if (Array.isArray(cachedCoupons) && cachedCoupons.length > 0) {
            return res.status(200).send({ usedCoupons: cachedCoupons });
          }
        } catch (error) {
          req.log.error(`[CUSTOMER/COUPONS]: Failed to fetch cached promo codes for user ${user.customerId}: ${error}`);
        }

        try {
          const storedCoupons = await usersService.getStoredCouponsByUserId(user.id);

          if (!storedCoupons || storedCoupons.length === 0) {
            return res.status(200).send({ usedCoupons: [] });
          }

          const promotionalCodes = await Promise.all(
            storedCoupons.map((coupon) => paymentService.getPromoCode(coupon)),
          );

          const usedCoupons = promotionalCodes
            .map((promo) => promo?.code)
            .filter((code): code is string => Boolean(code));

          await cacheService.setUsedUserPromoCodes(user.customerId, usedCoupons);

          return res.status(200).send({ usedCoupons });
        } catch (error) {
          req.log.error(`[CUSTOMER/COUPONS]: Failed to retrieve stored coupons for user ${user.id}: ${error}`);

          throw error;
        }
      },
    );
  };
}
