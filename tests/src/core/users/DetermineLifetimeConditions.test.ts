import axios from 'axios';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { StorageService } from '../../../../src/services/storage.service';
import { TierNotFoundError, TiersService } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import Stripe from 'stripe';
import { DetermineLifetimeConditions } from '../../../../src/core/users/DetermineLifetimeConditions';
import { getUser, newTier, getCustomer, getInvoice } from '../../fixtures';
import { Service } from '../../../../src/core/users/Tier';
import { InternalServerError } from '../../../../src/errors/Errors';

let tiersService: TiersService;
let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let storageService: StorageService;
let determineLifetimeConditions: DetermineLifetimeConditions;

beforeAll(() => {
  tiersRepository = testFactory.getTiersRepository();
  usersRepository = testFactory.getUsersRepositoryForTest();
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = testFactory.getCouponsRepositoryForTest();
  usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
  usersTiersRepository = testFactory.getUsersTiersRepository();
  productsRepository = testFactory.getProductsRepositoryForTest();
  usersTiersRepository = testFactory.getUsersTiersRepository();
  bit2MeService = new Bit2MeService(config, axios);
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    bit2MeService,
  );
  usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
  storageService = new StorageService(config, axios);
  tiersService = new TiersService(
    usersService,
    paymentService,
    tiersRepository,
    usersTiersRepository,
    storageService,
    config,
  );

  determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
});

describe('Determining Lifetime conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Handling stack lifetime', () => {
    it('when there is no tier, then an error indicating so is thrown', async () => {
      const user = getUser({ lifetime: true });
      const customer = getCustomer({ id: user.customerId });
      const tierNotFoundError = new TierNotFoundError(`Tier not found for user ${user.uuid} when stacking lifetime`);

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([customer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([]);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
      jest.spyOn(determineLifetimeConditions as any, 'getHigherTier').mockResolvedValue(null);

      await expect((determineLifetimeConditions as any).handleStackingLifetime(user)).rejects.toThrow(
        tierNotFoundError,
      );
    });

    it('When we want to fetch the higher tier and the max space bytes, then the correct tier and bytes are returned', async () => {
      const user = getUser({ lifetime: true });
      const customer = getCustomer({ id: user.customerId });
      const invoice = getInvoice();
      const mockedTier = newTier({ billingType: 'lifetime' });

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      jest.spyOn(paymentService, 'getCustomersByEmail').mockResolvedValue([customer]);
      jest.spyOn(paymentService, 'getInvoicesFromUser').mockResolvedValue([invoice]);
      jest.spyOn(determineLifetimeConditions as any, 'getPaidInvoices').mockResolvedValue([invoice]);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
      jest.spyOn(determineLifetimeConditions as any, 'getHigherTier').mockResolvedValue(mockedTier);

      const result = await (determineLifetimeConditions as any).handleStackingLifetime(user);

      expect(result.tier).toEqual(mockedTier);
      expect(result.maxSpaceBytes).toBe(parseInt(invoice.lines.data[0].price?.metadata?.maxSpaceBytes ?? '0'));
    });
  });

  describe('Get paid invoices', () => {
    it('When there is no metadata in the invoice, then the invoice should be skipped', async () => {
      const customer = getCustomer();
      const invoice = getInvoice();
      invoice.lines.data[0].price!.metadata = {};

      const result = await (determineLifetimeConditions as any).getPaidInvoices(customer, [invoice]);

      expect(result).toEqual([]);
    });

    it('When the invoice is paid out of band, then the invoice is returned directly', async () => {
      const customer = getCustomer();
      const invoice = getInvoice();
      invoice.paid = true;
      invoice.paid_out_of_band = true;
      invoice.lines.data[0].price!.metadata!.planType = 'one_time';
      invoice.metadata = {};

      const result = await (determineLifetimeConditions as any).getPaidInvoices(customer, [invoice]);

      expect(result).toEqual([invoice]);
    });

    it('When the invoice is paid and it has not been refunded nor disputed, then the invoice is returned', async () => {
      const customer = getCustomer();
      const invoice = getInvoice();
      invoice.metadata = { chargeId: 'ch_123' };
      invoice.lines.data[0].price!.metadata!.planType = 'one_time';
      invoice.paid = true;

      jest
        .spyOn(paymentService, 'retrieveCustomerChargeByChargeId')
        .mockResolvedValue({ refunded: false, disputed: false } as any);

      const result = await (determineLifetimeConditions as any).getPaidInvoices(customer, [invoice]);

      expect(result).toEqual([invoice]);
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

      const result = await (determineLifetimeConditions as any).getHigherTier([productId], null);

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

      const result = await (determineLifetimeConditions as any).getHigherTier([productId], [smallerTier]);

      expect(result).toBe(biggerTier);
    });

    it('When the tier does not exist, then ignores it and continues', async () => {
      const productId = 'prod_not_found';
      const userTier = [newTier({ billingType: 'lifetime' })];

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(new TierNotFoundError('not found'));

      const result = await (determineLifetimeConditions as any).getHigherTier([productId], userTier);

      expect(result).toBe(userTier[0]);
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const unexpectedError = new InternalServerError('Random error');
      const productId = 'prod_not_found';
      const userTier = [newTier({ billingType: 'lifetime' })];

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      await expect((determineLifetimeConditions as any).getHigherTier([productId], userTier)).rejects.toThrow(
        unexpectedError,
      );
    });
  });
});
