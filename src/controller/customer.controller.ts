import { FastifyInstance } from 'fastify';

import { UsersService } from '../services/users.service';
import config from '../config';
import CacheService from '../services/cache.service';
import { PaymentService } from '../services/payment.service';
import Stripe from 'stripe';
import { setupAuth } from '../plugins/auth';

export function customerController(
  usersService: UsersService,
  paymentService: PaymentService,
  cacheService: CacheService,
) {
  return async function (fastify: FastifyInstance) {
    await setupAuth(fastify, { secret: config.JWT_SECRET });

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

          const promoCodeResults = await Promise.allSettled(
            storedCoupons.map((coupon) => paymentService.getPromoCode({ couponId: coupon })),
          );

          promoCodeResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              req.log.warn(
                `[UUID/${uuid}] Failed to get user promo code for coupon ${storedCoupons[index]}: ${result.reason}`,
              );
            }
          });

          const promotionalCodes = promoCodeResults
            .filter(
              (result): result is PromiseFulfilledResult<Stripe.PromotionCode> =>
                result.status === 'fulfilled' && Boolean(result.value),
            )
            .map((result) => result.value);

          const usedCoupons = promotionalCodes.map((promo) => promo?.code);

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
