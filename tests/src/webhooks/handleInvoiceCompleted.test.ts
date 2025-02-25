import Stripe from 'stripe';
import axios from 'axios';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { ExtendedSubscription, PaymentService } from '../../../src/services/payment.service';
import testFactory from '../utils/factory';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { createOrUpdateUser, StorageService, updateUserTier } from '../../../src/services/storage.service';
import config from '../../../src/config';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import CacheService from '../../../src/services/cache.service';
import handleInvoiceCompleted from '../../../src/webhooks/handleInvoiceCompleted';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';
import { getCustomer, getInvoice, getLogger, getUser } from '../fixtures';

jest.mock('../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../src/services/storage.service');

  return {
    ...actualModule,
    createOrUpdateUser: jest.fn(),
    updateUserTier: jest.fn(),
  };
});

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
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let objectStorageService: ObjectStorageService;
let user: ReturnType<typeof getUser>;

const fakeInvoiceCompletedSession = {
  status: 'paid',
} as unknown as Stripe.Invoice;

describe('Process when an invoice payment is completed', () => {
  beforeEach(() => {
    user = getUser({ lifetime: true });
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

    objectStorageService = new ObjectStorageService(paymentService, config, axios);

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({ deleted: false, customer: user.customerId } as any);
    jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue({
      data: [
        {
          price: {
            metadata: {
              maxSpaceBytes: 10,
            },
            product: {},
          },
        },
      ],
    } as any);
    jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([] as ExtendedSubscription[]);
    (createOrUpdateUser as jest.Mock).mockResolvedValue(Promise.resolve({ data: { user } }));
    (updateUserTier as jest.Mock).mockResolvedValue(Promise.resolve());

    jest.clearAllMocks();
  });

  describe('User update', () => {
    it('When the user exists, then update their information as needed', async () => {
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(user);
      jest.spyOn(usersRepository, 'updateUser');

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(paymentService.getActiveSubscriptions).toHaveBeenCalledTimes(1);
      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
    });

    it('When the user does not exist, then create a new one', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer();
      const userNotFoundError = new UserNotFoundError('User has been not found');
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(userNotFoundError);
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });

      const insertUserSpy = jest.spyOn(usersRepository, 'insertUser').mockResolvedValueOnce();

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(paymentService.getActiveSubscriptions).toHaveBeenCalledTimes(1);
      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(usersRepository.updateUser).toHaveBeenCalledTimes(0);
      expect(insertUserSpy).toHaveBeenCalledTimes(1);
    });

    it('When creating the user fails, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer();
      const userNotFoundError = new UserNotFoundError('User has been not found');
      const insertUserError = new Error('Error while inserting the user');
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(userNotFoundError);
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });

      jest.spyOn(usersRepository, 'insertUser').mockRejectedValue(insertUserError);

      await expect(
        handleInvoiceCompleted(
          fakeInvoiceCompletedSession,
          usersService,
          paymentService,
          getLogger(),
          cacheService,
          config,
          objectStorageService,
        ),
      ).rejects.toThrow(insertUserError);

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(paymentService.getActiveSubscriptions).toHaveBeenCalledTimes(1);
      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invoice status', () => {
    it('When the invoice is not paid, then log a message and take no action', async () => {
      const fakeInvoiceCompletedSession = { status: 'open' } as unknown as Stripe.Invoice;
      jest.spyOn(paymentService, 'getCustomer');

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(0);
    });
  });

  describe('Customer cases', () => {
    it('When the customer is marked as deleted, then log an error and stop processing', async () => {
      const fakeInvoiceCompletedSession = { status: 'paid' } as unknown as Stripe.Invoice;
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({ deleted: true, customer: user.customerId } as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems');

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(0);
    });
  });

  describe('Invoice details', () => {
    it('When the invoice lacks price or product details, then an error indicating so is thrown', async () => {
      const fakeInvoiceCompletedSession = { status: 'paid' } as unknown as Stripe.Invoice;
      const mockedInvoice = getInvoice({
        lines: {} as any,
      });
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(user);
      const getCustomerSpy = jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue({ deleted: false, customer: user.customerId } as any);
      const getInvoiceItemsSpy = jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as any);
      const getActiveSubscriptionsSpy = jest.spyOn(paymentService, 'getActiveSubscriptions');

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(getCustomerSpy).toHaveBeenCalledTimes(1);
      expect(getInvoiceItemsSpy).toHaveBeenCalledTimes(1);
      expect(getActiveSubscriptionsSpy).toHaveBeenCalledTimes(0);
    });
  });
});
