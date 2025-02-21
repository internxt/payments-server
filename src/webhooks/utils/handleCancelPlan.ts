import { FastifyBaseLogger } from 'fastify';
import CacheService from '../../services/cache.service';
import { CustomerId } from '../../services/payment.service';
import { UsersService } from '../../services/users.service';
import { TiersService } from '../../services/tiers.service';
import Stripe from 'stripe';

interface HandleCancelPlanProps {
  customerId: CustomerId;
  customerEmail: string;
  productId: Stripe.Product['id'];
  usersService: UsersService;
  cacheService: CacheService;
  tiersService: TiersService;
  log: FastifyBaseLogger;
}

export const handleCancelPlan = async ({
  customerId,
  customerEmail,
  productId,
  usersService,
  cacheService,
  tiersService,
  log,
}: HandleCancelPlanProps) => {
  const user = await usersService.findUserByCustomerID(customerId);
  const { id: userId, lifetime: hasBoughtALifetime } = user;
  const tier = await tiersService.getTierProductsByProductsId(productId);

  if (hasBoughtALifetime) {
    // This user has switched from a subscription to a lifetime, therefore we do not want to downgrade his space
    // The space should not be set to Free plan.
    return;
  }

  await usersService.updateUser(customerId, { lifetime: false });

  try {
    await cacheService.clearSubscription(customerId);
  } catch (err) {
    log.error(`Error in handleLifetimeRefunded after trying to clear ${customerId} subscription`);
  }

  await tiersService.removeTier({ ...user, email: customerEmail }, productId);
  await tiersService.deleteTierFromUser(userId, tier.id);
};
