import Stripe from 'stripe';
import { PaymentService } from '../../services/payment.service';
import { TierNotFoundError, TiersService } from '../../services/tiers.service';
import { Service, Tier } from './Tier';
import { User, UserType } from './User';
import { FREE_PLAN_BYTES_SPACE } from '../../constants';
import { BadRequestError } from '../../errors/Errors';
import Logger from '../../Logger';
import { stripePaymentsAdapter } from '../../infrastructure/adapters/stripe.adapter';
import { getInvoicePriceId, getInvoiceProductId } from '../../utils/invoice';

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
    const customer = await stripePaymentsAdapter.getCustomer(user.customerId);

    const { email } = customer;
    const customersRelatedToUser = await this.paymentsService.getCustomersByEmail(email);
    let totalMaxSpaceBytes = 0;
    const productIds: string[] = [];

    // Get total Max Space Bytes
    for (const customer of customersRelatedToUser) {
      const invoices = await this.paymentsService.getInvoicesFromUser(customer.id, {
        limit: 100,
      });
      const pricesById = await this.paymentsService.getPricesByIds(
        invoices.map(getInvoicePriceId).filter((priceId): priceId is string => !!priceId),
      );

      const filteredPaidInvoices = await this.getPaidInvoices(customer, invoices, pricesById);

      Logger.info(`Found ${filteredPaidInvoices.length} paid invoices for customer ${customer.id}`);

      filteredPaidInvoices.forEach((invoice) => {
        productIds.push(getInvoiceProductId(invoice) ?? '');
      });

      totalMaxSpaceBytes += filteredPaidInvoices.reduce(
        (accum, invoice) =>
          Number.parseInt(this.getInvoicePrice(invoice, pricesById)?.metadata?.maxSpaceBytes ?? '0') + accum,
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
      throw new TierNotFoundError(`Tier not found for user ${user.uuid} when stacking lifetime`);
    }

    return {
      tier: userFinalTier,
      maxSpaceBytes: totalMaxSpaceBytes || FREE_PLAN_BYTES_SPACE,
    };
  }

  private async getPaidInvoices(
    customer: Stripe.Customer,
    invoices: Stripe.Invoice[],
    pricesById: Map<Stripe.Price['id'], Stripe.Price>,
  ): Promise<Stripe.Invoice[]> {
    const paidInvoices = await Promise.all(
      invoices
        .filter((invoice) => invoice.status === 'paid')
        .map(async (invoice) => {
          const priceMetadata = this.getInvoicePrice(invoice, pricesById)?.metadata;

          if (!priceMetadata) {
            Logger.warn(`Invoice ${invoice.id} for customer ${customer.id} has no price metadata`);
            return null;
          }

          const isLifetime = priceMetadata.planType?.trim() === 'one_time';
          const paidPayment = invoice.payments?.data.find(
            (invoicePayment) => invoicePayment.status === 'paid',
          )?.payment;
          const paidExternally = !paidPayment?.charge && !paidPayment?.payment_intent;

          Logger.info(
            `Found invoice ${invoice.id} for customer ${customer.id} which is ${isLifetime ? 'lifetime' : 'not lifetime'} and ${paidExternally ? 'paid externally' : 'not paid internally'}`,
          );

          if (!isLifetime) return null;

          if (paidExternally) return invoice;

          const chargeId = invoice.metadata?.chargeId ?? (await this.getChargeId(paidPayment));

          if (!chargeId) return invoice;

          const charge = await this.paymentsService.retrieveCustomerChargeByChargeId(chargeId);
          const isFullyRefunded = charge.refunded;
          const isDisputed = charge.disputed;

          return !isFullyRefunded && !isDisputed ? invoice : null;
        }),
    );

    return paidInvoices.filter((invoice): invoice is Stripe.Invoice => invoice !== null);
  }

  private getInvoicePrice(invoice: Stripe.Invoice, pricesById: Map<Stripe.Price['id'], Stripe.Price>) {
    const priceId = getInvoicePriceId(invoice);
    return priceId ? pricesById.get(priceId) : undefined;
  }

  private async getChargeId(payment: Stripe.InvoicePayment.Payment): Promise<Stripe.Charge['id'] | undefined> {
    if (payment.charge) {
      return typeof payment.charge === 'string' ? payment.charge : payment.charge.id;
    }

    const paymentIntentId =
      typeof payment.payment_intent === 'string' ? payment.payment_intent : payment.payment_intent?.id;
    if (!paymentIntentId) return undefined;

    const { latest_charge: latestCharge } = await this.paymentsService.getPaymentIntent(paymentIntentId);
    return typeof latestCharge === 'string' ? latestCharge : latestCharge?.id;
  }

  private async getHigherTier(productIds: string[], userTier: Tier[] | null) {
    let userFinalTier: Tier | undefined = undefined;

    if (userTier) {
      userFinalTier = userTier.find((tier) => tier.billingType === 'lifetime');
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
