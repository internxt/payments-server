import { TierNotFoundError } from '../../../../src/services/tiers.service';
import Stripe from 'stripe';
import { getUser, newTier, getCustomer, getInvoice, getSubscription, getPrice } from '../../fixtures';
import { Service } from '../../../../src/core/users/Tier';
import { BadRequestError, InternalServerError } from '../../../../src/errors/Errors';
import { createTestServices } from '../../helpers/services-factory';
import { stripePaymentsAdapter } from '../../../../src/infrastructure/adapters/stripe.adapter';
import { Customer } from '../../../../src/infrastructure/domain/entities/customer';

describe('Determining Lifetime conditions', () => {
  const { stripe, paymentService, tiersService, determineLifetimeConditions } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Handling errors when determining the conditions', () => {
    it('When the product is old, an error indicating so is thrown', async () => {
      const tierNotFoundError = new TierNotFoundError('Old product was found');
      const mockedUser = getUser();

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

      await expect(determineLifetimeConditions.determine(mockedUser, 'invalid_product_id')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('When an unexpected error occurs while fetching the product, then an error indicating so is thrown', async () => {
      const unexpectedError = new InternalServerError('Unknown error');
      const mockedUser = getUser();

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      await expect(determineLifetimeConditions.determine(mockedUser, 'invalid_product_id')).rejects.toThrow(
        InternalServerError,
      );
    });
  });

  describe('The user is free', () => {
    it('When the user is free, then the tier and the maxSpaceBytes tier field are returned', async () => {
      const mockedUser = getUser({
        lifetime: false,
      });
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);

      expect(tier).toStrictEqual(mockedTier);
      expect(maxSpaceBytes).toStrictEqual(mockedTier.featuresPerService[Service.Drive].maxSpaceBytes);
    });
  });

  describe('The user already has a subscription', () => {
    it('When the user has an active subscription, then the subscription is cancelled and the lifetime tier is returned', async () => {
      const mockedUser = getUser({
        lifetime: false,
      });
      const mockedUserSubscription = getSubscription({ type: 'subscription' });
      const subscriptionId = mockedUserSubscription.type === 'subscription' && mockedUserSubscription.subscriptionId;
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedUserSubscription);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockResolvedValue();

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);

      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(1);
      expect(cancelSubscriptionSpy).toHaveBeenCalledWith(subscriptionId as string);
      expect(tier).toStrictEqual(mockedTier);
      expect(maxSpaceBytes).toStrictEqual(tier.featuresPerService[Service.Drive].maxSpaceBytes);
    });
  });

  describe('The user already has a lifetime plan', () => {
    const lifetimePrice = (maxSpaceBytes: string) =>
      getPrice({ metadata: { planType: 'one_time', maxSpaceBytes }, product: `prod_${maxSpaceBytes}` });
    const paidWithCard = (paymentIntentId: string) =>
      ({ type: 'payment_intent', payment_intent: paymentIntentId }) as Stripe.InvoicePayment.Payment;
    const paidOutOfBand = {
      type: 'payment_record',
      payment_record: 'pr_test',
    } as unknown as Stripe.InvoicePayment.Payment;

    const paidInvoice = (
      price: Stripe.Price,
      { payment, metadata = {} }: { payment?: Stripe.InvoicePayment.Payment; metadata?: Stripe.Metadata } = {},
    ) =>
      getInvoice({
        status: 'paid',
        metadata,
        lines: { data: [{ pricing: { price_details: { price: price.id, product: price.product as string } } }] },
        payments: { data: payment ? [{ status: 'paid', payment }] : [] },
      });

    const mockStripe = ({
      invoicesByCustomer,
      prices,
      charges = [],
    }: {
      invoicesByCustomer: Record<string, Stripe.Invoice[]>;
      prices: Stripe.Price[];
      charges?: Pick<Stripe.Charge, 'id' | 'refunded' | 'disputed'>[];
    }) => {
      jest
        .spyOn(stripe.invoices, 'list')
        .mockImplementation((async (params: any) => ({ data: invoicesByCustomer[params.customer] ?? [] })) as any);
      jest
        .spyOn(stripe.prices, 'retrieve')
        .mockImplementation(async (priceId: string) => prices.find((price) => price.id === priceId) as any);
      jest
        .spyOn(stripe.paymentIntents, 'retrieve')
        .mockImplementation(async (paymentIntentId: string) => ({ latest_charge: `ch_of_${paymentIntentId}` }) as any);
      jest
        .spyOn(stripe.charges, 'retrieve')
        .mockImplementation(
          async (chargeId: string) =>
            (charges.find((charge) => charge.id === chargeId) ?? { refunded: false, disputed: false }) as any,
        );
    };

    const stackLifetimesFor = async (customers: Stripe.Customer[]) => {
      const user = getUser({ lifetime: true, customerId: customers[0].id });
      const tier = newTier({ billingType: 'lifetime' });
      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'lifetime' } as any);
      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(Customer.toDomain(customers[0]));
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue(customers);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(tier);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);

      const result = await determineLifetimeConditions.determine(user, tier.productId);

      return { ...result, expectedTier: tier };
    };

    test('When the user already has paid lifetimes, then their storage is stacked and the lifetime tier is returned', async () => {
      const customer = getCustomer();
      const firstPrice = lifetimePrice('1000');
      const secondPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(firstPrice, { payment: paidWithCard('pi_first') }),
            paidInvoice(secondPrice, { payment: paidWithCard('pi_second') }),
          ],
        },
        prices: [firstPrice, secondPrice],
      });

      const { maxSpaceBytes, tier, expectedTier } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(3000);
      expect(tier).toStrictEqual(expectedTier);
    });

    test('When the user has several accounts with the same email, then the lifetimes of all of them are stacked', async () => {
      const customer = getCustomer();
      const otherCustomer = getCustomer({ id: 'cus_other' });
      const firstPrice = lifetimePrice('1000');
      const secondPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [paidInvoice(firstPrice, { payment: paidWithCard('pi_first') })],
          [otherCustomer.id]: [paidInvoice(secondPrice, { payment: paidWithCard('pi_second') })],
        },
        prices: [firstPrice, secondPrice],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer, otherCustomer]);

      expect(maxSpaceBytes).toBe(3000);
    });

    test('When a lifetime was paid outside Stripe, then its storage is stacked', async () => {
      const customer = getCustomer();
      const price = lifetimePrice('1000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [paidInvoice(price, { payment: paidOutOfBand, metadata: { chargeId: 'external_charge' } })],
        },
        prices: [price],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
      expect(stripe.charges.retrieve).not.toHaveBeenCalled();
    });

    test('When a lifetime was free thanks to a full discount, then its storage is stacked', async () => {
      const customer = getCustomer();
      const price = lifetimePrice('1000');
      mockStripe({ invoicesByCustomer: { [customer.id]: [paidInvoice(price)] }, prices: [price] });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });

    test('When a lifetime payment was refunded, then its storage is not stacked', async () => {
      const customer = getCustomer();
      const keptPrice = lifetimePrice('1000');
      const refundedPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(keptPrice, { payment: paidWithCard('pi_kept') }),
            paidInvoice(refundedPrice, { payment: paidWithCard('pi_refunded') }),
          ],
        },
        prices: [keptPrice, refundedPrice],
        charges: [{ id: 'ch_of_pi_refunded', refunded: true, disputed: false }],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });

    test('When a lifetime payment was disputed, then its storage is not stacked', async () => {
      const customer = getCustomer();
      const keptPrice = lifetimePrice('1000');
      const disputedPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(keptPrice, { payment: paidWithCard('pi_kept') }),
            paidInvoice(disputedPrice, { payment: paidWithCard('pi_disputed') }),
          ],
        },
        prices: [keptPrice, disputedPrice],
        charges: [{ id: 'ch_of_pi_disputed', refunded: false, disputed: true }],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });

    test('When the invoice points to a specific charge, then that charge decides whether the lifetime counts', async () => {
      const customer = getCustomer();
      const keptPrice = lifetimePrice('1000');
      const refundedPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(keptPrice, { payment: paidWithCard('pi_kept') }),
            paidInvoice(refundedPrice, { payment: paidWithCard('pi_other'), metadata: { chargeId: 'ch_refunded' } }),
          ],
        },
        prices: [keptPrice, refundedPrice],
        charges: [{ id: 'ch_refunded', refunded: true, disputed: false }],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });

    test('When a lifetime was paid with a direct charge, then that charge decides whether the lifetime counts', async () => {
      const customer = getCustomer();
      const keptPrice = lifetimePrice('1000');
      const refundedPrice = lifetimePrice('2000');
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(keptPrice, { payment: paidWithCard('pi_kept') }),
            paidInvoice(refundedPrice, { payment: { type: 'charge', charge: 'ch_direct' } }),
          ],
        },
        prices: [keptPrice, refundedPrice],
        charges: [{ id: 'ch_direct', refunded: true, disputed: false }],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });

    test('When an invoice is not for a lifetime plan, unpaid or without a plan price, then its storage is not stacked', async () => {
      const customer = getCustomer();
      const lifetime = lifetimePrice('1000');
      const subscriptionPrice = getPrice({ metadata: { planType: 'subscription', maxSpaceBytes: '2000' } });
      const unpaidLifetime = lifetimePrice('4000');
      const unpaidInvoice = { ...paidInvoice(unpaidLifetime), status: 'open' } as Stripe.Invoice;
      const invoiceWithoutPrice = getInvoice({ status: 'paid', lines: { data: [{ pricing: null }] } });
      mockStripe({
        invoicesByCustomer: {
          [customer.id]: [
            paidInvoice(lifetime, { payment: paidWithCard('pi_lifetime') }),
            paidInvoice(subscriptionPrice, { payment: paidWithCard('pi_subscription') }),
            unpaidInvoice,
            invoiceWithoutPrice,
          ],
        },
        prices: [lifetime, subscriptionPrice, unpaidLifetime],
      });

      const { maxSpaceBytes } = await stackLifetimesFor([customer]);

      expect(maxSpaceBytes).toBe(1000);
    });
  });

  describe('Handling stack lifetime', () => {
    it('when there is no tier, then an error indicating so is thrown', async () => {
      const user = getUser({ lifetime: true });
      const customer = getCustomer({ id: user.customerId });
      const tierNotFoundError = new TierNotFoundError(`Tier not found for user ${user.uuid} when stacking lifetime`);

      jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(Customer.toDomain(customer));
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([customer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([]);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
      //@ts-ignore
      jest.spyOn(determineLifetimeConditions, 'getHigherTier').mockResolvedValue(null);

      //@ts-ignore
      await expect(determineLifetimeConditions.handleStackingLifetime(user)).rejects.toThrow(tierNotFoundError);
    });
  });

  describe('Get higher tier', () => {
    it('When there are no userTiers, then returns the tier from productIds', async () => {
      const productId = 'prod_123';
      const tierFromProduct = newTier({
        productId,
        billingType: 'lifetime',
      });

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(tierFromProduct);

      //@ts-ignore
      const result = await determineLifetimeConditions.getHigherTier([productId], null);

      expect(result).toBe(tierFromProduct);
    });

    it('When there are 2 tiers, then the higher is returned', async () => {
      const productId = 'prod_456';
      const smallerTier = newTier({
        billingType: 'lifetime',
      });
      smallerTier.featuresPerService[Service.Drive].maxSpaceBytes = 1000;
      const biggerTier = newTier({
        productId,
        billingType: 'lifetime',
      });
      biggerTier.featuresPerService[Service.Drive].maxSpaceBytes = 5000;

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(biggerTier);

      //@ts-ignore
      const result = await determineLifetimeConditions.getHigherTier([productId], [smallerTier]);

      expect(result).toBe(biggerTier);
    });

    it('When the tier does not exist, then ignores it and continues', async () => {
      const productId = 'prod_not_found';
      const userTier = [newTier({ billingType: 'lifetime' })];

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(new TierNotFoundError('not found'));

      //@ts-ignore
      const result = await determineLifetimeConditions.getHigherTier([productId], userTier);

      expect(result).toBe(userTier[0]);
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const unexpectedError = new InternalServerError('Random error');
      const productId = 'prod_not_found';
      const userTier = [newTier({ billingType: 'lifetime' })];

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      //@ts-ignore
      await expect(determineLifetimeConditions.getHigherTier([productId], userTier)).rejects.toThrow(unexpectedError);
    });
  });
});
