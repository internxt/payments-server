import Stripe from 'stripe';
import axios from 'axios';
import { FastifyBaseLogger } from 'fastify';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { PaymentService } from '../../../src/services/payment.service';
import testFactory from '../utils/factory';
import { UsersService } from '../../../src/services/users.service';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { StorageService } from '../../../src/services/storage.service';
import config from '../../../src/config';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { handleDisputeResult } from '../../../src/webhooks/handleDisputeResult';
import CacheService from '../../../src/services/cache.service';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { getCharge, getDispute, getInvoice, getLogger, getUser, voidPromise } from '../fixtures';
import { TiersService } from '../../../src/services/tiers.service';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';

jest.mock('../../../src/webhooks/handleLifetimeRefunded', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('stripe', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      charges: {
        retrieve: jest.fn(),
      },
      invoices: {
        retrieve: jest.fn(),
      },
    })),
  };
});

jest.mock('../../../src/services/cache.service', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let tiersService: TiersService;
let tiersRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let logger: jest.Mocked<FastifyBaseLogger>;

describe('handleDisputeResult()', () => {
  beforeEach(() => {
    logger = getLogger();

    stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    productsRepository = testFactory.getProductsRepositoryForTest();
    tiersRepository = testFactory.getTiersRepository();
    usersTiersRepository = testFactory.getUsersTiersRepository();

    cacheService = new CacheService(config);
    storageService = new StorageService(config, axios);
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);

    tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      config,
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

    jest.clearAllMocks();
  });

  describe('Dispute Status is Lost', () => {
    it('When the status is lost and the user has a subscription, then the subscription is cancelled and the storage is downgraded', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedCharge = getCharge({
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        dispute: mockedDispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
        tiersService,
      });

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockedCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockedCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedCharge.customer);
      expect(paymentService.cancelSubscription).toHaveBeenCalledWith(mockedInvoice.subscription);
    });

    it('When the status is lost and the user has a lifetime, then the lifetime param is changed to false and the storage is downgraded', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedInvoice = getInvoice({
        customer: mockedUser.customerId,
      });
      const mockedCharge = getCharge({
        customer: mockedUser.customerId,
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(axios, 'request').mockImplementation(voidPromise);

      await handleDisputeResult({
        dispute: mockedDispute,
        tiersService,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
      });

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockedCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockedCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedCharge.customer);
      expect(handleLifetimeRefunded).toHaveBeenCalledWith(
        storageService,
        usersService,
        mockedCharge,
        cacheService,
        paymentService,
        logger,
        tiersService,
        config,
      );
    });
  });

  describe('Dispute Status is Not Lost', () => {
    it('When the status is different to lost, then nothing is changed', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedInvoice = getInvoice({
        customer: mockedUser.customerId,
      });
      const mockedCharge = getCharge({
        customer: mockedUser.customerId,
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        status: 'needs_response',
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        dispute: mockedDispute,
        tiersService,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
      });

      expect(stripe.charges.retrieve).not.toHaveBeenCalled();
      expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
      expect(usersRepository.findUserByCustomerId).not.toHaveBeenCalled();
      expect(paymentService.cancelSubscription).not.toHaveBeenCalled();
      expect(handleLifetimeRefunded).not.toHaveBeenCalled();
    });
  });
});
