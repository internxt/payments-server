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
        const pricing = invoice.lines.data[0].pricing;
        const productId = pricing?.price_details?.product;
        productIds.push(productId ?? '');
      });

      const pricePromises = filteredPaidInvoices.map(async (invoice) => {
        const pricing = invoice.lines.data[0].pricing;
        if (pricing?.type === 'price_details' && pricing.price_details?.price) {
          const priceId = pricing.price_details.price;
          const price = await this.paymentsService.getPrice(priceId);
          return parseInt(price?.metadata?.maxSpaceBytes ?? '0');
        }
        return 0;
      });

      const spaceBytesArray = await Promise.all(pricePromises);
      const customerTotalBytes = spaceBytesArray.reduce((accum, bytes) => accum + bytes, 0);
      totalMaxSpaceBytes += customerTotalBytes;
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
        const invoiceData = await this.paymentsService.getInvoice(invoice.id);
        const line = invoiceData.lines.data[0];
        const price = await this.paymentsService.getPrice(line.pricing?.price_details?.price as string);

        if (!price?.metadata) {
          console.warn(`Invoice ${invoiceData.id} for customer ${customer.id} has no price metadata`);
          return null;
        }

        const isLifetime = price?.metadata?.planType === 'one_time';
        const isPaid = invoiceData.status === 'paid';
        const invoiceMetadata = invoiceData.metadata;
        const isPaidOutOfBand = isPaid && invoiceData.payments?.data.length === 0;

        if (isLifetime && isPaid && isPaidOutOfBand) {
          return invoiceData;
        }

        if (!invoiceData.payments?.data[0].payment.payment_intent) {
          Logger.info('There is no payment intent in the invoice');
          return null;
        }

        const paymentIntent = await this.paymentsService.getPaymentIntent(
          invoiceData.payments?.data[0].payment.payment_intent as string,
        );

        if (!paymentIntent.latest_charge || paymentIntent.status !== 'succeeded') {
          Logger.info(
            `There is no charge in the payment intent or the status is not succeeded. Payment intent: ${paymentIntent.latest_charge}`,
          );
          return null;
        }
        const chargeIdFromPaymentIntent =
          typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge.id;
        const chargeId = invoiceMetadata?.chargeId ?? chargeIdFromPaymentIntent;

        if (!chargeId) {
          return null;
        }

        const charge = await this.paymentsService.retrieveCustomerChargeByChargeId(chargeId);
        const isFullyRefunded = charge.refunded;
        const isDisputed = charge.disputed;

        if (isLifetime && isPaid && !isFullyRefunded && !isDisputed) {
          return invoiceData;
        }

        return null;
      }),
    );

    return paidInvoices.filter((invoice): invoice is Stripe.Response<Stripe.Invoice> => invoice !== null);
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
