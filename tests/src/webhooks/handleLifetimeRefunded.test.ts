import Stripe from 'stripe';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import CacheService from '../../../src/services/cache.service';
import { PaymentService } from '../../../src/services/payment.service';
import { StorageService, updateUserTier } from '../../../src/services/storage.service';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { FastifyBaseLogger } from 'fastify';
import { getCharge, getInvoice, getLogger, getUser } from '../fixtures';
import testFactory from '../utils/factory';
import config from '../../../src/config';
import axios from 'axios';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../../../src/constants';

jest.mock('stripe', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});
jest.mock('../../../src/services/cache.service', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});
jest.mock('../../../src/webhooks/utils/handleCancelPlan');
jest.mock('../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../src/services/storage.service');

  return {
    ...actualModule,
    updateUserTier: jest.fn(),
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
let objectStorageService: ObjectStorageService;
let logger: jest.Mocked<FastifyBaseLogger>;

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

  objectStorageService = new ObjectStorageService(paymentService, config, axios);

  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Process when a lifetime is refunded', () => {
  it('When the refund of a lifetime that have Tier is requested, then it is refunded successfully', async () => {
    const mockedUser = getUser({ lifetime: true });
    const mockedCharge = getCharge();
    const mockedInvoiceLineItems = getInvoice().lines;

    const getInvoiceLineItemsSpy = jest
      .spyOn(paymentService, 'getInvoiceLineItems')
      .mockResolvedValue(mockedInvoiceLineItems as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);

    await handleLifetimeRefunded(
      storageService,
      usersService,
      mockedCharge,
      cacheService,
      paymentService,
      logger,
      tiersService,
      config,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(getInvoiceLineItemsSpy).toHaveBeenCalledWith(mockedCharge.invoice);
    expect(handleCancelPlan).toHaveBeenCalledWith({
      customerId: mockedCharge.customer,
      customerEmail: mockedCharge.receipt_email,
      productId: (mockedInvoiceLineItems.data[0].price?.product as Stripe.Product).id,
      isLifetime: mockedUser.lifetime,
      usersService,
      tiersService,
      log: logger,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedUser = getUser();
    const mockedCharge = getCharge();
    const mockedInvoiceLineItems = getInvoice().lines;

    const getInvoiceLineItemsSpy = jest
      .spyOn(paymentService, 'getInvoiceLineItems')
      .mockResolvedValue(mockedInvoiceLineItems as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation();
    (handleCancelPlan as jest.Mock).mockRejectedValue(tierNotFoundError);

    await handleLifetimeRefunded(
      storageService,
      usersService,
      mockedCharge,
      cacheService,
      paymentService,
      logger,
      tiersService,
      config,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(getInvoiceLineItemsSpy).toHaveBeenCalledWith(mockedCharge.invoice);
    expect(handleCancelPlan).rejects.toThrow(tierNotFoundError);
    expect(updateUserSpy).toHaveBeenCalledWith(mockedCharge.customer, { lifetime: false });
    expect(updateUserTier).toHaveBeenCalledWith(mockedUser.uuid, FREE_INDIVIDUAL_TIER, config);
    expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
  });

  it('When the cancellation of a subscription that has a Tier is requested and a random error occur, then an error indicating so is thrown', async () => {
    const randomError = new Error('Tier not found');
    const mockedUser = getUser();
    const mockedCharge = getCharge();
    const mockedInvoiceLineItems = getInvoice().lines;

    jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoiceLineItems as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    (handleCancelPlan as jest.Mock).mockRejectedValue(randomError);

    await expect(
      handleLifetimeRefunded(
        storageService,
        usersService,
        mockedCharge,
        cacheService,
        paymentService,
        logger,
        tiersService,
        config,
      ),
    ).rejects.toThrow(randomError);
  });
});
