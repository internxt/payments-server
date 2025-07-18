import Stripe from 'stripe';
import axios from 'axios';

import { CouponsRepository } from '../../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../../src/services/bit2me.service';
import CacheService from '../../../../../src/services/cache.service';
import { PaymentService } from '../../../../../src/services/payment.service';
import { StorageService } from '../../../../../src/services/storage.service';
import { UserNotFoundError, UsersService } from '../../../../../src/services/users.service';
import { getCustomer, getInvoice, getLogger, getProduct, getUser, newTier } from '../../../fixtures';
import { ObjectStorageService } from '../../../../../src/services/objectStorage.service';
import { InvoiceCompletedHandler } from '../../../../../src/webhooks/events/invoices/InvoiceCompletedHandler';
import { ObjectStorageWebhookHandler } from '../../../../../src/webhooks/events/ObjectStorageWebhookHandler';
import { TiersService, UsersTiersError } from '../../../../../src/services/tiers.service';
import config from '../../../../../src/config';
import testFactory from '../../../utils/factory';
import { DetermineLifetimeConditions } from '../../../../../src/core/users/DetermineLifetimeConditions';
import { NotFoundError } from '../../../../../src/errors/Errors';
import { Service } from '../../../../../src/core/users/Tier';

jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    disconnect: jest.fn(),
    quit: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let tierRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let objectStorageService: ObjectStorageService;
let invoiceCompletedHandler: InvoiceCompletedHandler;
let determineLifetimeConditions: DetermineLifetimeConditions;
let objectStorageWebhookHandler: ObjectStorageWebhookHandler;
let tiersService: TiersService;

describe('Testing the handler when an invoice is completed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    tierRepository = testFactory.getTiersRepository();
    usersTiersRepository = testFactory.getUsersTiersRepository();
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

    tiersService = new TiersService(
      usersService,
      paymentService,
      tierRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    objectStorageService = new ObjectStorageService(paymentService, config, axios);
    objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService, getLogger());
    determineLifetimeConditions = new DetermineLifetimeConditions(paymentService, tiersService);
    invoiceCompletedHandler = new InvoiceCompletedHandler(
      getLogger(),
      determineLifetimeConditions,
      objectStorageWebhookHandler,
      paymentService,
      storageService,
      tiersService,
      usersService,
      cacheService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Invoice Data Extraction', () => {
    test('When we want to extract the invoice data from a valid invoice (contains a customer), then the extracted data should be returned correctly', async () => {
      const mockedInvoice = getInvoice({ status: 'paid' });

      const mockedExtractInvoiceData = invoiceCompletedHandler['extractInvoiceData'].bind(invoiceCompletedHandler);
      const result = mockedExtractInvoiceData(mockedInvoice);

      expect(result).toStrictEqual({
        customerId: mockedInvoice.customer,
        customerEmail: mockedInvoice.customer_email,
        invoiceId: mockedInvoice.id,
        status: mockedInvoice.status,
      });
      expect(typeof result.customerId).toBe('string');
      expect(typeof result.invoiceId).toBe('string');
      expect(typeof result.status).toBe('string');
      expect(result.customerEmail).toBe(mockedInvoice.customer_email);
    });

    test('When there is no customer when extracting invoice data, then an error indicating so is thrown', async () => {
      const mockedInvoice = getInvoice({ status: 'paid', customer: null });
      const mockedExtractInvoiceData = invoiceCompletedHandler['extractInvoiceData'].bind(invoiceCompletedHandler);

      expect(() => mockedExtractInvoiceData(mockedInvoice)).toThrow(NotFoundError);
    });
  });

  describe('User Data Processing', () => {
    test('When user is found by email, then it should return user unique Id', async () => {
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedUser = getUser({
        customerId: mockedCustomer.id,
      });
      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue({
        data: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
        },
      });

      const mockGetUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await mockGetUserUuid(mockedCustomer.id, mockedCustomer.email as string);

      expect(result).toStrictEqual({
        uuid: mockedUser.uuid,
      });
    });

    test('When user is not found by email but found by customer ID, then it should return user unique Id', async () => {
      const mockedCustomer = getCustomer({
        email: undefined,
      });
      const mockedUser = getUser({
        customerId: mockedCustomer.id,
      });
      const findByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);

      const mockGetUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await mockGetUserUuid(mockedCustomer.id, mockedCustomer.email);

      expect(result).toStrictEqual({
        uuid: mockedUser.uuid,
      });
      expect(findByCustomerIdSpy).toHaveBeenCalled();
    });

    test('When user is not found by email or customer ID, then an error indicating so is thrown', async () => {
      const mockedCustomer = getCustomer({
        email: undefined,
      });
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new Error());

      const mockGetUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);

      await expect(mockGetUserUuid(mockedCustomer.id, mockedCustomer.email)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Update or Insert User', () => {
    test('When user exists, then it should update existing user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockResolvedValue();
      const insertUserSpy = jest.spyOn(usersService, 'insertUser');

      const mockedUpdateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await mockedUpdateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).toHaveBeenCalledTimes(1);
      expect(insertUserSpy).not.toHaveBeenCalled();
    });

    test('When user does not exist, then it should insert new user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new UserNotFoundError());
      const updateUserSpy = jest.spyOn(usersService, 'updateUser');
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const mockedUpdateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await mockedUpdateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).not.toHaveBeenCalled();
      expect(insertUserSpy).toHaveBeenCalledTimes(1);
    });
  });

  });
});
