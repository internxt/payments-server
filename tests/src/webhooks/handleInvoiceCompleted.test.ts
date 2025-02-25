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
import handleInvoiceCompleted, {
  handleObjectStorageInvoiceCompleted,
} from '../../../src/webhooks/handleInvoiceCompleted';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';
import { getCustomer, getInvoice, getLogger, getProduct, getUser } from '../fixtures';
import { UserType } from '../../../src/core/users/User';

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

    jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([] as ExtendedSubscription[]);
    (createOrUpdateUser as jest.Mock).mockResolvedValue(Promise.resolve({ data: { user } }));
    (updateUserTier as jest.Mock).mockResolvedValue(Promise.resolve());

    jest.clearAllMocks();
  });

  it('When the invoice is not paid, then log a message and stop processing', async () => {
    const mockedInvoice = getInvoice({ status: 'open' });
    const log = getLogger();
    const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer');

    await handleInvoiceCompleted(
      mockedInvoice,
      usersService,
      paymentService,
      log,
      cacheService,
      config,
      objectStorageService,
    );

    expect(getCustomerSpy).not.toHaveBeenCalled();
  });

  describe('User update', () => {
    it('When the user exists, then update their information as needed', async () => {
      const mockedInvoice = getInvoice({ status: 'paid' });
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(user);
      jest.spyOn(usersRepository, 'updateUser');

      await handleInvoiceCompleted(
        mockedInvoice,
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
      const mockedInvoice = getInvoice({ status: 'paid' });
      const userNotFoundError = new UserNotFoundError('User has been not found');
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(userNotFoundError);
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });

      const insertUserSpy = jest.spyOn(usersRepository, 'insertUser').mockResolvedValueOnce();

      await handleInvoiceCompleted(
        mockedInvoice,
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
      const mockedInvoice = getInvoice({ status: 'paid' });
      const userNotFoundError = new UserNotFoundError('User has been not found');
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      const insertUserError = new Error('Error while inserting the user');
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(userNotFoundError);
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });

      jest.spyOn(usersRepository, 'insertUser').mockRejectedValue(insertUserError);

      await expect(
        handleInvoiceCompleted(
          mockedInvoice,
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

    it('When the price metadata has no maxSpaceBytes, then an error indicating so is thrown', async () => {
      const mockedInvoice = getInvoice();
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines.data as any);
      const getActiveSubSpy = jest.spyOn(paymentService, 'getActiveSubscriptions');
      if (mockedInvoice.lines.data[0].price && mockedInvoice.lines.data[0].price.metadata) {
        mockedInvoice.lines.data[0].price.metadata = {};
      }

      const log = getLogger();

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        log,
        cacheService,
        config,
        objectStorageService,
      );

      expect(getActiveSubSpy).not.toHaveBeenCalled();
      expect(mockedInvoice.lines.data[0].price?.metadata.maxSpaceBytes).toBeUndefined();
    });
  });

  describe('The subscription is for an object storage sub', () => {
    it('When the product is not an obj storage type, then skips to the next process', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedProduct = getProduct({});
      const log = getLogger();

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
      const reactivateObjAccountSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockImplementation();

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(reactivateObjAccountSpy).not.toHaveBeenCalled();
    });

    it('When the invoice is completed, then the object storage account is activated', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedProduct = getProduct({ userType: UserType.ObjectStorage });
      const log = getLogger();

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
      const reactivateObjAccountSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockImplementation();

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(reactivateObjAccountSpy).toHaveBeenCalled();
    });
  });

  describe('The user has a coupon', () => {
    it('When the user has a tracked coupon, then the coupon is stored correctly', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedInvoice = getInvoice({
        status: 'paid',
        customer: mockedCustomer.id,
        lines: {
          data: [
            {
              price: {
                id: `price_12333`,
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 102389234,
                currency: 'usd',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {
                  maxSpaceBytes: `1837284738`,
                  type: UserType.Individual,
                },
                nickname: null,
                product: {
                  id: `prod_12333`,
                  type: 'service',
                  object: 'product',
                  active: true,
                  created: 1678833149,
                  default_price: null,
                  description: null,
                  images: [],
                  marketing_features: [],
                  livemode: false,
                  metadata: {
                    type: UserType.Individual,
                  },
                  name: 'Gold Plan',
                  package_dimensions: null,
                  shippable: null,
                  statement_descriptor: null,
                  tax_code: null,
                  unit_label: null,
                  updated: 1678833149,
                  url: null,
                },
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  trial_period_days: null,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 1000,
                unit_amount_decimal: '1000',
              },
              discounts: [
                {
                  id: 'coupon_id',
                  coupon: 'COUPON' as any,
                },
              ],
            },
          ],
        },
      } as any);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(usersRepository, 'updateUser').mockImplementation();
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storedCouponSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        config,
        objectStorageService,
      );

      expect(storedCouponSpy).toHaveBeenCalledTimes(1);
    });
  });
});
