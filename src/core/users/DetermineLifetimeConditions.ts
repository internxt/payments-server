import Stripe from 'stripe';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { Service, Tier } from './Tier';
import { User, UserType } from './User';

export class DetermineLifetimeConditions {
  constructor(
    private readonly paymentsService: PaymentService,
    private readonly tiersService: TiersService,
  ) {}

  /**
   * For a given user that bought a lifetime, determines
   * which tier and maxSpaceBytes corresponds to it, taking into
   * consideration different situations.
   *
   * Possible cases:
   * - The user already has a sub
   * - The user already has a lifetime -> stacking
   * - The user is free -> new customer
   * @param user
   * @param productId
   * @returns
   */
  async determine(user: User, productId: string): Promise<{ tier: Tier; maxSpaceBytes: number }> {
    const isLifetime = user.lifetime;
    const subscription = await this.paymentsService.getUserSubscription(user.customerId, UserType.Individual);
    const isSubscriber = subscription.type === 'subscription';
    const isFree = !isLifetime && !isSubscriber;

    const tier = await this.tiersService.getTierProductsByProductsId(productId, 'lifetime').catch((err) => {
      if (err instanceof TierNotFoundError) {
        return null;
      }
    });

    const oldProduct = !tier;

    if (oldProduct) {
      throw new Error(`Old product ${productId} found`);
    }

    if (isFree) {
      return { tier, maxSpaceBytes: tier.featuresPerService[Service.Drive].maxSpaceBytes };
    } else if (isSubscriber) {
      await this.paymentsService.cancelSubscription(subscription.subscriptionId);

      return { tier, maxSpaceBytes: tier.featuresPerService[Service.Drive].maxSpaceBytes };
    } else if (isLifetime) {
      return this.handleStackingLifetime(user);
    } else {
      throw new Error(`Unknown user ${user.uuid} status for product ${productId}`);
    }
  }

  /**
   * Retrieves all the payment's processor customers with the user's email
   * and its invoices to calculate the tier and the maxSpaceBytes
   *
   * **THE ACTUAL CRITERIA IS: The higher tier and the sum of all the paid
   * maxSpaceBytes**
   * @param user The user to stack
   * @returns
   */
  private async handleStackingLifetime(user: User): Promise<{
    maxSpaceBytes: number;
    tier: Tier;
  }> {
    const customer = await this.paymentsService.getCustomer(user.customerId);

    if (customer.deleted) {
      throw new Error(`Found customer ${customer.id} for user ${user.uuid} but is deleted`);
    }

    const { email } = customer;
    const customersRelatedToUser = await this.paymentsService.getCustomersByEmail(email);
    let totalMaxSpaceBytes = 0;
    const productIds: string[] = [];

    for (const customer of customersRelatedToUser) {
      const invoices = await this.paymentsService.getInvoicesFromUser(customer.id, {
        limit: 100,
      });
      const paidInvoices = (
        await Promise.all(
          invoices.map(async (invoice) => {
            const line = invoice.lines.data[0];

            if (!line || !line.price || !line.price.metadata) {
              console.warn(`⚠️ Invoice ${invoice.id} for customer ${customer.id} has no price metadata`);
              return null;
            }

            const isLifetime = line.price?.metadata?.planType === 'one_time';
            const isPaid = invoice.paid;
            const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id;

            if (!chargeId) return null;
            const charge = await this.paymentsService.retrieveCustomerCharge(chargeId);
            const isFullyRefunded = charge.refunded;

            if (isLifetime && isPaid && !isFullyRefunded) {
              return invoice;
            }

            return null;
          }),
        )
      ).filter((invoice): invoice is Stripe.Invoice => invoice !== null);

      paidInvoices.forEach((invoice) => {
        productIds.push((invoice.lines.data[0].price?.product as string) || '');
      });

      totalMaxSpaceBytes += paidInvoices.reduce(
        (accum, invoice) => parseInt(invoice.lines.data[0].price?.metadata?.maxSpaceBytes ?? '0') + accum,
        0,
      );
    }

    const userTier = await this.tiersService.getTiersProductsByUserId(user.id).catch((err) => {
      if (!(err instanceof TierNotFoundError)) {
        throw err;
      }

      return null;
    });

    let userFinalTier;

    if (userTier) {
      userFinalTier = userTier.filter((tier) => tier.billingType === 'lifetime').at(0);
    } else {
      await this.tiersService.getTierProductsByProductsId('free');
    }

    for (const productId of productIds) {
      const tierForThisProduct = await this.tiersService
        .getTierProductsByProductsId(productId, 'lifetime')
        .catch((err) => {
          if (!(err instanceof TierNotFoundError)) {
            throw err;
          }
          return undefined;
        });

      if (!tierForThisProduct) continue;

      if (
        !userFinalTier ||
        userFinalTier.featuresPerService[Service.Drive].maxSpaceBytes <
          tierForThisProduct.featuresPerService[Service.Drive].maxSpaceBytes
      ) {
        userFinalTier = tierForThisProduct;
      }
    }

    if (!userFinalTier) {
      throw new Error(`Tier not found for user ${user.uuid} when stacking lifetime`);
    }

    return { tier: userFinalTier, maxSpaceBytes: totalMaxSpaceBytes };
  }
}
