import { TierNotFoundError } from '../../../../src/services/tiers.service';
import Stripe from 'stripe';
import {
  getUser,
  newTier,
  getCustomer,
  getInvoice,
  getSubscription,
  getPrice,
  getInvoices,
  getCharge,
  getPaymentIntent,
} from '../../fixtures';
import { Service } from '../../../../src/core/users/Tier';
import { BadRequestError, InternalServerError } from '../../../../src/errors/Errors';
import { createTestServices } from '../../helpers/services-factory';

describe('Determining Lifetime conditions', () => {
  const { paymentService, tiersService, determineLifetimeConditions } = createTestServices();

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
    test('When the user already has a lifetime, then the storage should be stacked', async () => {
      const expectedTotalMaxSpaceBytes = 3;
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedTier = newTier();
      const mockedCustomer = getCustomer();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
          maxSpaceBytes: '1',
        },
      });
      const mockedCharge = getCharge({
        refunded: false,
        disputed: false,
      });
      const mockedLineItems = {
        lines: {
          data: [
            {
              pricing: {
                type: 'price_details',
                price_details: {
                  price: mockedPrice.id,
                  product: mockedTier.productId,
                },
              },
            },
          ],
        },
      };
      const mockedPayments = {
        payments: {
          data: [
            {
              payment: {
                payment_intent: mockedCharge.payment_intent,
              },
            },
          ],
        },
      };
      const mockedInvoice = getInvoice({
        status: 'paid',
        ...mockedPayments,
        ...(mockedLineItems as any),
      });
      const mockedPaymentIntent = getPaymentIntent({
        latest_charge: mockedCharge.id,
        status: 'succeeded',
      });

      const mockedInvoices = getInvoices(3, [mockedInvoice, mockedInvoice, mockedInvoice]);

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'lifetime' });
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([mockedCustomer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue(mockedInvoices);
      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(paymentService, 'getPaymentIntent')
        .mockResolvedValue(mockedPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
      jest.spyOn(paymentService, 'retrieveCustomerChargeByChargeId').mockResolvedValue(mockedCharge);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);

      const { maxSpaceBytes, tier } = await determineLifetimeConditions.determine(mockedUser, mockedTier.productId);

      expect(maxSpaceBytes).toStrictEqual(expectedTotalMaxSpaceBytes);
      expect(tier).toStrictEqual(mockedTier);
    });
  });

  describe('Handling stack lifetime', () => {
    it('When the customer is deleted, an error indicating so is thrown', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedTier = newTier({
        billingType: 'lifetime',
      });

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({ type: 'free' });
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({
        deleted: true,
      } as Stripe.Response<Stripe.DeletedCustomer>);

      await expect(determineLifetimeConditions.determine(mockedUser, mockedTier.productId)).rejects.toThrow(Error);
    });

    it('when there is no tier, then an error indicating so is thrown', async () => {
      const user = getUser({ lifetime: true });
      const customer = getCustomer({ id: user.customerId });
      const tierNotFoundError = new TierNotFoundError(`Tier not found for user ${user.uuid} when stacking lifetime`);

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([customer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([]);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
      //@ts-ignore
      jest.spyOn(determineLifetimeConditions, 'getHigherTier').mockResolvedValue(null);

      //@ts-ignore
      await expect(determineLifetimeConditions.handleStackingLifetime(user)).rejects.toThrow(tierNotFoundError);
    });

    it('When we want to fetch the higher tier and the max space bytes, then the correct tier and bytes are returned', async () => {
      const user = getUser({ lifetime: true });
      const mockedCustomer = getCustomer({ id: user.customerId });
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
          maxSpaceBytes: '3',
        },
      });
      const mockedCharge = getCharge();
      const mockedTier = newTier({ billingType: 'lifetime' });
      const mockedInvoice = getInvoice({
        status: 'paid',
        lines: {
          data: [
            {
              pricing: {
                type: 'price_details',
                price_details: {
                  price: mockedPrice.id,
                  product: mockedTier.productId,
                },
              },
            },
          ],
        },
        payments: {
          data: [
            {
              payment: {
                payment_intent: mockedCharge.payment_intent as string,
              },
            },
          ],
        },
      });
      const mockedPaymentIntent = getPaymentIntent({
        latest_charge: mockedCharge.id,
        status: 'succeeded',
      });

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([mockedCustomer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([mockedInvoice]);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
      jest.spyOn(paymentService, 'retrieveCustomerChargeByChargeId').mockResolvedValue(mockedCharge);
      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest
        .spyOn(paymentService, 'getPaymentIntent')
        .mockResolvedValue(mockedPaymentIntent as Stripe.Response<Stripe.PaymentIntent>);

      //@ts-ignore
      const result = await determineLifetimeConditions.handleStackingLifetime(user);

      expect(result.tier).toEqual(mockedTier);
      expect(result.maxSpaceBytes).toBe(3);
    });
  });

  describe('Get paid invoices', () => {
    it('When there is no metadata in the invoice, then the invoice should be skipped', async () => {
      const customer = getCustomer();
      const invoice = getInvoice();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
        },
      });

      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(invoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);

      //@ts-ignore
      const result = await determineLifetimeConditions.getPaidInvoices(customer, [invoice]);

      expect(result).toEqual([]);
    });

    it('When the invoice is paid out of band, then the invoice is returned directly', async () => {
      const customer = getCustomer();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
        },
      });
      const mockedInvoice = getInvoice({
        status: 'paid',
        payments: {
          data: [],
        },
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: mockedPrice.id,
                },
              },
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);

      //@ts-ignore
      const result = await determineLifetimeConditions.getPaidInvoices(customer, [mockedInvoice]);

      expect(result).toEqual([mockedInvoice]);
    });

    it('When the invoice is paid and it has not been refunded nor disputed, then the invoice is returned', async () => {
      const customer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
        },
      });
      const mockedCharge = getCharge();
      const mockedPaymentIntent = getPaymentIntent({
        latest_charge: mockedCharge.id,
      });
      mockedInvoice.metadata = { chargeId: 'ch_123' };
      mockedInvoice.status = 'paid';

      jest
        .spyOn(paymentService, 'retrieveCustomerChargeByChargeId')
        .mockResolvedValue({ refunded: false, disputed: false } as any);
      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);

      //@ts-ignore
      const result = await determineLifetimeConditions.getPaidInvoices(customer, [mockedInvoice]);

      expect(result).toEqual([mockedInvoice]);
    });

    it('When the invoice is paid but it has been refunded, then the invoice is returned', async () => {
      const customer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
        },
      });
      mockedInvoice.metadata = { chargeId: 'ch_123' };
      mockedInvoice.status = 'paid';

      jest
        .spyOn(paymentService, 'retrieveCustomerChargeByChargeId')
        .mockResolvedValue({ refunded: true, disputed: false } as any);
      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);

      //@ts-ignore
      const result = await determineLifetimeConditions.getPaidInvoices(customer, [mockedInvoice]);

      expect(result).toStrictEqual([]);
    });

    it('When the invoice is paid and it has has been disputed, then the invoice is returned', async () => {
      const customer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedPrice = getPrice({
        metadata: {
          planType: 'one_time',
        },
      });
      mockedInvoice.metadata = { chargeId: 'ch_123' };
      mockedInvoice.status = 'paid';

      jest.spyOn(paymentService, 'getInvoice').mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest
        .spyOn(paymentService, 'retrieveCustomerChargeByChargeId')
        .mockResolvedValue({ refunded: false, disputed: true } as any);

      //@ts-ignore
      const result = await determineLifetimeConditions.getPaidInvoices(customer, [mockedInvoice]);

      expect(result).toStrictEqual([]);
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
