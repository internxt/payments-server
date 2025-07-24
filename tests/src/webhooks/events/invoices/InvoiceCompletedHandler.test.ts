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
import { CouponNotBeingTrackedError, UserNotFoundError, UsersService } from '../../../../../src/services/users.service';
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

      const extractInvoiceData = invoiceCompletedHandler['extractInvoiceData'].bind(invoiceCompletedHandler);
      const result = extractInvoiceData(mockedInvoice);

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
      const extractInvoiceData = invoiceCompletedHandler['extractInvoiceData'].bind(invoiceCompletedHandler);

      expect(() => extractInvoiceData(mockedInvoice)).toThrow(NotFoundError);
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

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await getUserUuid(mockedCustomer.id, mockedCustomer.email as string);

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

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await getUserUuid(mockedCustomer.id, mockedCustomer.email);

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

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);

      await expect(getUserUuid(mockedCustomer.id, mockedCustomer.email)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Update or Insert User', () => {
    test('When user exists, then it should update existing user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockResolvedValue();
      const insertUserSpy = jest.spyOn(usersService, 'insertUser');

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await updateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).toHaveBeenCalledTimes(1);
      expect(updateUserSpy).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: mockedUser.lifetime,
        uuid: mockedUser.uuid,
      });
      expect(insertUserSpy).not.toHaveBeenCalled();
    });

    test('When user does not exist, then it should insert new user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new UserNotFoundError());
      const updateUserSpy = jest.spyOn(usersService, 'updateUser');
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await updateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).not.toHaveBeenCalled();
      expect(insertUserSpy).toHaveBeenCalledTimes(1);
      expect(insertUserSpy).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        lifetime: mockedUser.lifetime,
        uuid: mockedUser.uuid,
      });
    });

    test('When there is an unexpected error while updating the user, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(unexpectedError);
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await expect(
        updateOrInsertUser({
          customerId: mockedUser.customerId,
          userUuid: mockedUser.uuid,
          isBusinessPlan: false,
          isLifetimePlan: false,
        }),
      ).rejects.toThrow(unexpectedError);
      expect(insertUserSpy).not.toHaveBeenCalled();
    });
  });

  describe('Old Product Management', () => {
    test('When processing old product, then it should call storage service with correct parameters', async () => {
      const mockedUser = getUser();
      const mockedMaxSpaceBytes = 100;
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();

      const handleOldProduct = invoiceCompletedHandler['handleOldProduct'].bind(invoiceCompletedHandler);
      await handleOldProduct(mockedUser.uuid, mockedMaxSpaceBytes);

      expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, mockedMaxSpaceBytes);
    });
  });

  describe('Tier Management (New products)', () => {
    describe('The user purchases a lifetime', () => {
      test('When determining the lifetime conditions, then apply the features correctly', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          email: 'test@inxt.com',
        });
        const mockedMaxSpaceBytes = 100;
        const lifetimeMockedMaxSpaceBytes = mockedMaxSpaceBytes * 5;
        const mockedIsLifetimePlan = true;
        const mockedProductId = getProduct({}).id;
        const totalQuantity = 1;
        const mockedTier = newTier();
        const mockedLifetimeTier = newTier({ billingType: 'lifetime' });
        const determineLifetimeConditionsSpy = jest.spyOn(determineLifetimeConditions, 'determine').mockResolvedValue({
          maxSpaceBytes: lifetimeMockedMaxSpaceBytes,
          tier: mockedLifetimeTier,
        });
        const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
        const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

        const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
        await handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        });

        expect(determineLifetimeConditionsSpy).toHaveBeenCalledWith(mockedUser, mockedProductId);
        expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedCustomer,
          totalQuantity,
          mockedLifetimeTier,
          expect.anything(),
          lifetimeMockedMaxSpaceBytes,
        );
        expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedLifetimeTier,
        );
      });

      test('When an error occurs while determining the lifetime conditions, then a log is printed but the flow continues with the default tier', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          email: 'test@inxt.com',
        });
        const mockedIsLifetimePlan = true;
        const mockedProductId = getProduct({}).id;
        const totalQuantity = 1;
        const mockedTier = newTier();
        const determineLifetimeConditionsSpy = jest
          .spyOn(determineLifetimeConditions, 'determine')
          .mockRejectedValue(unexpectedError);
        const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
        const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

        const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
        await handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        });

        expect(determineLifetimeConditionsSpy).toHaveBeenCalledWith(mockedUser, mockedProductId);
        expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedCustomer,
          totalQuantity,
          mockedTier,
          expect.anything(),
          undefined,
        );
        expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedTier,
        );
      });
    });

    test('When the user purchases a subscription, then all features are applied correctly', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();

      const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
      const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
      await handleNewProduct({
        user: {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        customer: mockedCustomer,
        isLifetimePlan: mockedIsLifetimePlan,
        productId: mockedProductId,
        totalQuantity,
        tier: mockedTier,
      });

      expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
        {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        mockedCustomer,
        totalQuantity,
        mockedTier,
        expect.anything(),
        undefined,
      );
      expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
        {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        mockedTier,
      );
    });

    test('When something goes wrong while applying Drive features, then an error indicating so is thrown', async () => {
      const mockedError = new Error('Failed to apply Drive features to user');
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();
      jest.spyOn(tiersService, 'applyDriveFeatures').mockRejectedValue(mockedError);
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
      await expect(
        handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        }),
      ).rejects.toThrow(mockedError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to apply drive features for user ${mockedUser.uuid} with customerId ${mockedCustomer.id}`,
        {
          error: mockedError.message,
        },
      );
    });

    test('When something goes wrong while applying VPN features, then an error indicating so is thrown', async () => {
      const mockedError = new Error('Failed to apply VPN features to user');
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();
      jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
      jest.spyOn(tiersService, 'applyVpnFeatures').mockRejectedValue(mockedError);
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);

      await expect(
        handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        }),
      ).rejects.toThrow(mockedError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to apply VPN features for user ${mockedUser.uuid} with customerId ${mockedCustomer.id}`,
        {
          error: mockedError.message,
        },
      );
    });
  });

  describe('User-Tier Relationship', () => {
    describe('Individual plans', () => {
      test('When matching tier exists for individual plan, then it should update existing tier', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;
        const mockedIndividualTier = newTier();

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedIndividualTier.id, mockedTierId);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When user with both subscriptions redeems business plan, then existing business tier gets updated', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });

        jest
          .spyOn(tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedIndividualTier, mockedBusinessTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedIndividualTier.id, mockedTierId);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When no matching tier exists (individual), then it should insert new tier', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTierId);
        expect(updateTierToUserSpy).not.toHaveBeenCalled();
      });
    });

    describe('Business plans', () => {
      test('When matching tier exists for business plan, then it should update existing tier', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedBusinessTier]);
        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedBusinessTier.id, mockedTierId);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When user with both subscriptions redeems business plan, then existing business tier gets updated', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });

        jest
          .spyOn(tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedIndividualTier, mockedBusinessTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedBusinessTier.id, mockedTierId);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When no matching tier exists (business), then it should insert new tier', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTierId = newTier().id;
        const mockedIndividualTier = newTier();

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const mockUpdateOrInsertUserTier =
          invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        });

        expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTierId);
        expect(updateTierToUserSpy).not.toHaveBeenCalled();
      });
    });

    test('When no matching tier exists (business), then it should insert new tier', async () => {
      const isBusinessPlan = true;
      const mockedUserId = getUser().id;
      const mockedTierId = newTier().id;
      const mockedIndividualTier = newTier();

      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);

      const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
      const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

      const mockUpdateOrInsertUserTier =
        invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
      await mockUpdateOrInsertUserTier({
        userId: mockedUserId,
        tierId: mockedTierId,
        isBusinessPlan,
      });

      expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTierId);
      expect(updateTierToUserSpy).not.toHaveBeenCalled();
    });

    test('When an error occurs while updating user tier, then an error indicating so is thrown', async () => {
      const usersTiersError = new UsersTiersError('User tiers error');
      const isBusinessPlan = false;
      const mockedUserId = getUser().id;
      const mockedTierId = newTier().id;
      const mockedIndividualTier = newTier({
        featuresPerService: {
          [Service.Drive]: {
            workspaces: {
              enabled: false,
            },
          },
        } as any,
      });

      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);
      jest.spyOn(tiersService, 'updateTierToUser').mockRejectedValue(usersTiersError);

      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const mockUpdateOrInsertUserTier =
        invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);

      await expect(
        mockUpdateOrInsertUserTier({
          userId: mockedUserId,
          tierId: mockedTierId,
          isBusinessPlan,
        }),
      ).rejects.toThrow(usersTiersError);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Error while updating or inserting the user-tier relationship. Error: Error: User tiers error`,
      );
    });
  });

  describe('User-Coupon Relationship', () => {
    test('When lifetime plan has discount, then it should store coupon from line item', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              discounts: [
                {
                  coupon: {
                    id: 'mocked-coupon',
                  },
                } as any,
              ],
            },
          ],
        },
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoice.lines.data[0],
        isLifetimePlan: true,
      });

      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(
        mockedUser,
        (mockedInvoice.lines.data[0].discounts[0] as Stripe.Discount).coupon.id,
      );
    });

    test('When subscription plan has discount, then it should store coupon from invoice', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoice.lines.data[0],
        isLifetimePlan: false,
      });

      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, mockedInvoice.discount?.coupon.id);
    });

    test('When no discount exists, then the flow continues', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: null,
      });
      const mockedInvoiceLineItem = {
        ...mockedInvoice.lines.data[0],
        discounts: [],
      };

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);

      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoiceLineItem,
        isLifetimePlan: false,
      });

      expect(storeCouponUsedByUserSpy).not.toHaveBeenCalled();
    });

    test('When the coupon code is not tracked, then an error is caught and the flow continues without storing the coupon', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest
        .spyOn(usersService, 'storeCouponUsedByUser')
        .mockRejectedValue(new CouponNotBeingTrackedError('Coupon not tracked'));
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);

      await expect(
        handleUserCouponRelationship({
          userUuid: mockedUser.uuid,
          invoice: mockedInvoice,
          invoiceLineItem: mockedInvoice.lines.data[0],
          isLifetimePlan: false,
        }),
      ).resolves.not.toThrow();
      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, 'mocked-coupon');
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    test('When an unexpected error occurs while storing the coupon, then an error is logged and is thrown', async () => {
      const randomError = new Error('Random error');
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockRejectedValue(randomError);
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);

      await expect(
        handleUserCouponRelationship({
          userUuid: mockedUser.uuid,
          invoice: mockedInvoice,
          invoiceLineItem: mockedInvoice.lines.data[0],
          isLifetimePlan: false,
        }),
      ).rejects.toThrow(randomError);
      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, 'mocked-coupon');
      expect(loggerSpy).toHaveBeenCalledWith(`Error while adding user ${mockedUser.uuid} and coupon: Random error`);
    });
  });

  describe('Cache Clearing', () => {
    test('When cache clearing succeeds, then it should log success message', async () => {
      const { customerId, uuid: userUuid } = getUser();
      const clearSubscriptionSpy = jest.spyOn(cacheService, 'clearSubscription').mockResolvedValue();
      const clearUsedUserPromoCodesSpy = jest.spyOn(cacheService, 'clearUsedUserPromoCodes').mockResolvedValue();
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'info');

      const clearUserRelatedCache = invoiceCompletedHandler['clearUserRelatedCache'].bind(invoiceCompletedHandler);
      await clearUserRelatedCache(customerId, userUuid);

      expect(clearSubscriptionSpy).toHaveBeenCalledWith(customerId);
      expect(clearUsedUserPromoCodesSpy).toHaveBeenCalledWith(userUuid);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Cache for user with uuid: ${userUuid} and customer Id: ${customerId} has been cleaned`,
      );
    });

    test('When cache clearing fails, then it should log an error and throw', async () => {
      const randomError = new Error('Random error');
      const { customerId, uuid: userUuid } = getUser();
      jest.spyOn(cacheService, 'clearSubscription').mockRejectedValue(randomError);
      const loggerSpy = jest.spyOn(invoiceCompletedHandler['logger'], 'error');

      const clearUserRelatedCache = invoiceCompletedHandler['clearUserRelatedCache'].bind(invoiceCompletedHandler);

      await expect(clearUserRelatedCache(customerId, userUuid)).rejects.toThrow(randomError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Error while trying to clear the cache in invoice completed handler for the customer ${customerId}. Error: ${randomError.message}`,
      );
    });
  });
});
