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
import { User } from '../../../src/core/users/User';
import { mockLogger, user } from '../mocks';

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

const fakeInvoiceCompletedSession = {
  status: 'paid',
} as unknown as Stripe.Invoice;

describe('handleInvoiceCompleted()', () => {
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

    objectStorageService = new ObjectStorageService(paymentService, config, axios);

    const mockedUser = user();
    jest
      .spyOn(paymentService, 'getCustomer')
      .mockResolvedValue({ deleted: false, customer: mockedUser.customerId } as any);
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
    (createOrUpdateUser as jest.Mock).mockResolvedValue(Promise.resolve({ data: { user: { ...mockedUser } } }));
    (updateUserTier as jest.Mock).mockResolvedValue(Promise.resolve());

    jest.clearAllMocks();
  });

  it('When user exists, then the user is updated if needed in the DB', async () => {
    const mockedUser = user();
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser as User);
    jest.spyOn(usersRepository, 'updateUser');

    await handleInvoiceCompleted(
      fakeInvoiceCompletedSession,
      usersService,
      paymentService,
      mockLogger(),
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

  it('When user does not exists, then it should insert a new user', async () => {
    jest.spyOn(usersService, 'findUserByUuid').mockRejectedValue(new UserNotFoundError());

    await handleInvoiceCompleted(
      fakeInvoiceCompletedSession,
      usersService,
      paymentService,
      mockLogger(),
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
    expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
  });

  it('When inserting a user fails, then it throws an error', async () => {
    jest.spyOn(usersService, 'findUserByUuid').mockRejectedValue(new UserNotFoundError());
    jest.spyOn(usersRepository, 'insertUser').mockRejectedValue(new Error('Insert User Error'));

    await expect(
      handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        mockLogger(),
        cacheService,
        config,
        objectStorageService,
      ),
    ).rejects.toThrow('Insert User Error');

    expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
    expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
    expect(paymentService.getActiveSubscriptions).toHaveBeenCalledTimes(1);
    expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
    expect(updateUserTier).toHaveBeenCalledTimes(1);
    expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
  });
});
