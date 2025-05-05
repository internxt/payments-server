import { FastifyBaseLogger } from 'fastify';
import { CouponNotBeingTrackedError, UsersService } from '../../../../services/users.service';
import Stripe from 'stripe';
import { User } from '../../../../core/users/User';

interface StoreCouponUsedByUserProps {
  usersService: UsersService;
  userUuid: User['uuid'];
  lineItem: Stripe.InvoiceLineItem;
  logger: FastifyBaseLogger;
}

export async function storeCouponUsedByUser({ usersService, lineItem, logger, userUuid }: StoreCouponUsedByUserProps) {
  try {
    const userData = await usersService.findUserByUuid(userUuid);
    const areDiscounts = lineItem.discounts.length > 0;
    if (areDiscounts) {
      const coupon = (lineItem.discounts[0] as Stripe.Discount).coupon;

      if (coupon) {
        await usersService.storeCouponUsedByUser(userData, coupon.id);
      }
    }
  } catch (err) {
    const error = err as Error;
    if (!(err instanceof CouponNotBeingTrackedError)) {
      logger.error(`[USER-COUPON/ERROR]: ${error.stack ?? error.message} / USER UUID:  ${userUuid}`);
    }
  }
}
