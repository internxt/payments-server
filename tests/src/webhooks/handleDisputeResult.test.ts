import Stripe from 'stripe';
import axios from 'axios';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { PaymentService } from '../../../src/services/payment.service';
import getMocks from '../mocks';
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

jest.mock('../../../src/webhooks/handleLifetimeRefunded');
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

const {
  mockCharge,
  mockInvoice,
  mockedUserWithLifetime,
  mockedUserWithoutLifetime,
  mockDispute,
  mockLogger,
  voidPromise,
} = getMocks();

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;

describe('handleDisputeResult()', () => {
  beforeEach(() => {
    stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    productsRepository = testFactory.getProductsRepositoryForTest();

    cacheService = new CacheService(config);
    storageService = new StorageService(config, axios);
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);

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
      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUserWithoutLifetime);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        charge: mockDispute as unknown as Stripe.Dispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: mockLogger,
      });

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockCharge.customer);
      expect(paymentService.cancelSubscription).toHaveBeenCalledWith(mockInvoice.subscription);
    });

    it('When the status is lost and the user has a lifetime, then the lifetime param is changed to false and the storage is downgraded', async () => {
      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUserWithLifetime);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(axios, 'request').mockImplementation(() => Promise.resolve());

      await handleDisputeResult({
        charge: mockDispute as unknown as Stripe.Dispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: mockLogger,
      });

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockCharge.customer);
      expect(handleLifetimeRefunded).toHaveBeenCalledWith(
        storageService,
        usersService,
        mockCharge.customer,
        cacheService,
        mockLogger,
        config,
      );
    });
  });

  describe('Dispute Status is Not Lost', () => {
    it('When the status is different to lost, then nothing is changed', async () => {
      mockDispute.status = 'needs_response';

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUserWithLifetime);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        charge: mockDispute as unknown as Stripe.Dispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: mockLogger,
      });

      expect(stripe.charges.retrieve).not.toHaveBeenCalled();
      expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
      expect(usersRepository.findUserByCustomerId).not.toHaveBeenCalled();
      expect(paymentService.cancelSubscription).not.toHaveBeenCalled();
      expect(handleLifetimeRefunded).not.toHaveBeenCalled();
    });
  });
});
