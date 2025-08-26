import Stripe from 'stripe';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { Service, Tier } from './Tier';
import { User, UserType } from './User';
import { FREE_PLAN_BYTES_SPACE } from '../../constants';
import { BadRequestError } from '../../errors/Errors';
import Logger from '../../Logger';

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
   * - The user is free -> new customer
   * - The user already has a sub -> cancelling the subscription
   * - The user already has a lifetime -> stacking
   * @param user
   * @param productId
   * @returns the total max space bytes and the higher tier
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

      throw err;
    });

    const oldProduct = !tier;

    if (oldProduct) {
      throw new BadRequestError(`Old product ${productId} found for user with id: ${user.uuid}`);
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
   * @returns the total max space bytes and the higher tier
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

    // Get total Max Space Bytes
    for (const customer of customersRelatedToUser) {
      const invoices = await this.paymentsService.getInvoicesFromUser(customer.id, {
        limit: 100,
      });

      const filteredPaidInvoices = await this.getPaidInvoices(customer, invoices);

      filteredPaidInvoices.forEach((invoice) => {
        const price = invoice.lines.data[0].price;
        const productId = typeof price?.product === 'string' ? price.product : price?.product.id;
        productIds.push(productId ?? '');
      });

      totalMaxSpaceBytes += filteredPaidInvoices.reduce(
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

    const userFinalTier = await this.getHigherTier(productIds, userTier);

    if (!userFinalTier) {
      throw new Error(`Tier not found for user ${user.uuid} when stacking lifetime`);
    }

    return {
      tier: userFinalTier,
      maxSpaceBytes: totalMaxSpaceBytes || FREE_PLAN_BYTES_SPACE,
    };
  }

  private async getPaidInvoices(customer: Stripe.Customer, invoices: Stripe.Invoice[]): Promise<Stripe.Invoice[]> {
    const paidInvoices = await Promise.all(
      invoices.map(async (invoice) => {
        const line = invoice.lines.data[0];

        if (!line?.price?.metadata) {
          Logger.warn(`Invoice ${invoice.id} for customer ${customer.id} has no price metadata`);
          return null;
        }

        const isLifetime = line.price?.metadata?.planType === 'one_time';
        const isPaid = invoice.paid;
        const invoiceMetadata = invoice.metadata;
        const isOutOfBand = invoice.paid_out_of_band;

        const chargeIdFromInvoice = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id;
        const chargeId = invoiceMetadata?.chargeId ?? chargeIdFromInvoice;
        const paidExternally = isOutOfBand || !chargeId;

        if (isLifetime && isPaid && paidExternally) {
          return invoice;
        }

        if (!chargeId) return null;

        const charge = await this.paymentsService.retrieveCustomerChargeByChargeId(chargeId);
        const isFullyRefunded = charge.refunded;
        const isDisputed = charge.disputed;

        if (isLifetime && isPaid && !isFullyRefunded && !isDisputed) {
          return invoice;
        }

        return null;
      }),
    );

    return paidInvoices.filter((invoice): invoice is Stripe.Invoice => invoice !== null);
  }

  private async getHigherTier(productIds: string[], userTier: Tier[] | null) {
    let userFinalTier;

    if (userTier) {
      userFinalTier = userTier.filter((tier) => tier.billingType === 'lifetime').at(0);
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

    return userFinalTier;
  }
}
