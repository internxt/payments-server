import axios from 'axios';
import Stripe from 'stripe';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import {
  InvalidLicenseCodeError,
  LicenseCodeAlreadyAppliedError,
  LicenseCodesService,
} from '../../../src/services/licenseCodes.service';
import testFactory from '../utils/factory';
import { PaymentService } from '../../../src/services/payment.service';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { StorageService } from '../../../src/services/storage.service';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import config from '../../../src/config';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { getCustomer, getLicenseCode, getLogger, getProduct, getUser, newTier, priceById } from '../fixtures';
import { LicenseCodesRepository } from '../../../src/core/users/LicenseCodeRepository';

let tiersRepository: TiersRepository;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let licenseCodesRepository: LicenseCodesRepository;
let bit2MeService: Bit2MeService;
let tiersService: TiersService;
let licenseCodesService: LicenseCodesService;
let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;

describe('Tests for License Codes service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    tiersRepository = testFactory.getTiersRepository();
    usersRepository = testFactory.getUsersRepositoryForTest();
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    productsRepository = testFactory.getProductsRepositoryForTest();
    licenseCodesRepository = testFactory.getLicenseCodesRepositoryForTest();
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
    licenseCodesService = new LicenseCodesService({
      paymentService,
      usersService,
      storageService,
      licenseCodesRepository,
      tiersService,
    });
  });

  describe('Check if license code is available', () => {
    test('when the license code is not redeemed, then it returns true indicating so', async () => {
      const mockedLicenseCode = getLicenseCode();
      jest.spyOn(licenseCodesRepository, 'findOne').mockResolvedValue(mockedLicenseCode);

      const isAvailable = await licenseCodesService.isLicenseCodeAvailable(
        mockedLicenseCode.code,
        mockedLicenseCode.provider,
      );
      expect(isAvailable).toBe(true);
    });

    test('When the license code is already redeemed, then an error indicating so is thrown', async () => {
      const mockedLicenseCode = getLicenseCode({ redeemed: true });
      jest.spyOn(licenseCodesRepository, 'findOne').mockResolvedValue(mockedLicenseCode);

      await expect(
        licenseCodesService.isLicenseCodeAvailable(mockedLicenseCode.code, mockedLicenseCode.provider),
      ).rejects.toThrow(LicenseCodeAlreadyAppliedError);
    });

    test('When the license code does not exist, then an error indicating so is thrown', async () => {
      jest.spyOn(licenseCodesRepository, 'findOne').mockResolvedValue(null);

      await expect(licenseCodesService.isLicenseCodeAvailable('code', 'provider')).rejects.toThrow(
        InvalidLicenseCodeError,
      );
    });
  });

  describe('Redeem codes', () => {
    test('When the license code is valid and the customer exists, then it is marked as redeemed', async () => {
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode();
      const mockedTier = newTier();
      const mockedLogger = getLogger();

      const findOneLicenseRepositorySpy = jest
        .spyOn(licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);
      const getCustomerSpy = jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      const findUserByUuidSpy = jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const subscribeSpy = jest.spyOn(paymentService, 'subscribe').mockResolvedValue({
        maxSpaceBytes: 100,
        recurring: false,
      });
      const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockResolvedValue();
      const getTierProductSpy = jest.spyOn(licenseCodesService, 'getTierProduct').mockResolvedValue(mockedTier);
      const applyProductFeaturesSpy = jest.spyOn(licenseCodesService, 'applyProductFeatures').mockResolvedValue();
      const updateByCodeSpy = jest.spyOn(licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await licenseCodesService.redeem({
        code: mockedLicenseCode.code,
        provider: mockedLicenseCode.provider,
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
        },
        logger: mockedLogger,
      });

      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
      expect(getCustomerSpy).toHaveBeenCalledWith(mockedUser.customerId);
      expect(findUserByUuidSpy).toHaveBeenCalledWith(mockedUser.uuid);
      expect(subscribeSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedLicenseCode.priceId);
      expect(updateUserSpy).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: true,
      });
      expect(getTierProductSpy).toHaveBeenCalledWith(mockedLicenseCode);
      expect(applyProductFeaturesSpy).toHaveBeenCalledWith({
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
        },
        customer: mockedCustomer,
        logger: mockedLogger,
        maxSpaceBytes: 100,
        tierProduct: mockedTier,
      });
      expect(updateByCodeSpy).toHaveBeenCalledWith(mockedLicenseCode.code, { redeemed: true });
    });

    test('When the license code is valid and the customer does not exists, then the license code is marked as redeemed and the user is created', async () => {
      const mockedCustomer = getCustomer();
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedLicenseCode = getLicenseCode();
      const mockedTier = newTier();
      const mockedLogger = getLogger();

      const findOneLicenseRepositorySpy = jest
        .spyOn(licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);
      const findUserByUuidSpy = jest.spyOn(usersService, 'findUserByUuid').mockRejectedValue(new UserNotFoundError());
      const createCustomerSpy = jest
        .spyOn(paymentService, 'createCustomer')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      const subscribeSpy = jest.spyOn(paymentService, 'subscribe').mockResolvedValue({
        maxSpaceBytes: 100,
        recurring: false,
      });
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();
      const getTierProductSpy = jest.spyOn(licenseCodesService, 'getTierProduct').mockResolvedValue(mockedTier);
      const applyProductFeaturesSpy = jest.spyOn(licenseCodesService, 'applyProductFeatures').mockResolvedValue();
      const updateByCodeSpy = jest.spyOn(licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await licenseCodesService.redeem({
        code: mockedLicenseCode.code,
        provider: mockedLicenseCode.provider,
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
          name: mockedCustomer.name as string,
        },
        logger: mockedLogger,
      });

      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
      expect(createCustomerSpy).toHaveBeenCalledWith({
        name: mockedCustomer.name,
        email: mockedCustomer.email,
      });
      expect(findUserByUuidSpy).toHaveBeenCalledWith(mockedUser.uuid);
      expect(subscribeSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedLicenseCode.priceId);
      expect(insertUserSpy).toHaveBeenCalledWith({
        customerId: mockedCustomer.id,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });
      expect(getTierProductSpy).toHaveBeenCalledWith(mockedLicenseCode);
      expect(applyProductFeaturesSpy).toHaveBeenCalledWith({
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
          name: mockedCustomer.name as string,
        },
        customer: mockedCustomer,
        logger: mockedLogger,
        maxSpaceBytes: 100,
        tierProduct: mockedTier,
      });
      expect(updateByCodeSpy).toHaveBeenCalledWith(mockedLicenseCode.code, { redeemed: true });
    });

    test('When there is no license code, then an error indicating so is thrown', async () => {
      const invalidLicenseCodeError = new InvalidLicenseCodeError();
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode();
      const mockedLogger = getLogger();

      const findOneLicenseRepositorySpy = jest
        .spyOn(licenseCodesRepository, 'findOne')
        .mockRejectedValue(invalidLicenseCodeError);

      await expect(
        licenseCodesService.redeem({
          code: mockedLicenseCode.code,
          provider: mockedLicenseCode.provider,
          user: {
            email: mockedCustomer.email as string,
            uuid: mockedUser.uuid,
          },
          logger: mockedLogger,
        }),
      ).rejects.toThrow(invalidLicenseCodeError);
      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
    });

    test('When the license code is already redeemed, then an error indicating so is thrown', async () => {
      const licenseCodeAlreadyAppliedError = new LicenseCodeAlreadyAppliedError();
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode({ redeemed: true });
      const mockedLogger = getLogger();

      const findOneLicenseRepositorySpy = jest
        .spyOn(licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);

      await expect(
        licenseCodesService.redeem({
          code: mockedLicenseCode.code,
          provider: mockedLicenseCode.provider,
          user: {
            email: mockedCustomer.email as string,
            uuid: mockedUser.uuid,
          },
          logger: mockedLogger,
        }),
      ).rejects.toThrow(licenseCodeAlreadyAppliedError);
      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
    });
  });

  describe('Get Tier product', () => {
    test('When the tier exists by product id, then it returns the tier correctly', async () => {
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedPrice = priceById({
        bytes: 1000,
        interval: 'lifetime',
        product: mockedTier.productId,
      });

      jest.spyOn(paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      const getTierProductByProductIdSpy = jest
        .spyOn(tiersService, 'getTierProductsByProductsId')
        .mockResolvedValue(mockedTier);
      const result = await licenseCodesService.getTierProduct(mockedLicenseCode);

      expect(result).toStrictEqual(mockedTier);
      expect(getTierProductByProductIdSpy).toHaveBeenCalledWith(mockedTier.productId, 'lifetime');
    });

    test('When the tier does not exist, then it returns null', async () => {
      const tierNotFoundError = new TierNotFoundError('Tier not found');
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedPrice = priceById({
        bytes: 1000,
        interval: 'lifetime',
        product: mockedTier.productId,
      });

      jest.spyOn(paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);
      const result = await licenseCodesService.getTierProduct(mockedLicenseCode);

      expect(result).toBeNull();
    });

    test('When an unexpected error occurs while getting the product, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Product error');
      const mockedLicenseCode = getLicenseCode();

      jest.spyOn(paymentService, 'getPriceById').mockRejectedValue(unexpectedError);

      await expect(licenseCodesService.getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
    });

    test('When an unexpected error occurs while getting the tier, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Product error');
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedPrice = priceById({
        bytes: 1000,
        interval: 'lifetime',
        product: mockedTier.productId,
      });

      jest.spyOn(paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      await expect(licenseCodesService.getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
    });
  });

  describe('Apply redeemed codes', () => {
    describe('Redeemed code with no tier', () => {
      test('When the user redeems a valid code, then only the storage is updated', async () => {
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const maxSpaceBytes = 100;

        const updateStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();
        await licenseCodesService.applyProductFeatures({
          user,
          customer: mockedCustomer,
          logger: mockedLogger,
          maxSpaceBytes,
          tierProduct: null,
        });

        expect(updateStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, maxSpaceBytes);
      });

      test('When an unexpected error occurs while applying the storage, then an error indicating so is thrown', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const maxSpaceBytes = 100;

        jest.spyOn(storageService, 'changeStorage').mockRejectedValue(unexpectedError);
        await expect(
          licenseCodesService.applyProductFeatures({
            user,
            customer: mockedCustomer,
            logger: mockedLogger,
            maxSpaceBytes,
            tierProduct: null,
          }),
        ).rejects.toThrow(unexpectedError);
      });
    });

    describe('Redeemed code with tier', () => {
      test('When the user redeems a valid code that match with any tier, then the tier is applied', async () => {
        const tierNotFoundError = new TierNotFoundError('Tier not found');
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const mockedTier = newTier();

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        const applyTierSpy = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
        jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        await licenseCodesService.applyProductFeatures({
          user,
          customer: mockedCustomer,
          logger: mockedLogger,
          maxSpaceBytes: 100,
          tierProduct: mockedTier,
        });

        expect(applyTierSpy).toHaveBeenCalledWith(user, mockedCustomer, 1, mockedTier.productId, mockedLogger);
      });

      test('When the user does not have any tier, then the tier-user relationship is inserted into the collection after applying the features', async () => {
        const mockedProduct = getProduct({});
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const mockedUserTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });
        const mockedTier = newTier();

        jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedUserTier]);
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        await licenseCodesService.applyProductFeatures({
          user,
          customer: mockedCustomer,
          logger: mockedLogger,
          maxSpaceBytes: 100,
          tierProduct: mockedTier,
        });

        expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
      });

      test('When the user has an individual tier, then the tier-user relationship is updated into the collection after applying the features', async () => {
        const mockedProduct = getProduct({});
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const mockedUserTier = newTier();
        const mockedTier = newTier();
        const maxSpaceBytes = 100;

        jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedUserTier]);
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser');
        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();

        await licenseCodesService.applyProductFeatures({
          user,
          customer: mockedCustomer,
          logger: mockedLogger,
          maxSpaceBytes,
          tierProduct: mockedTier,
        });

        expect(insertTierToUserSpy).not.toHaveBeenCalled();
        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedUserTier.id, mockedTier.id);
      });

      test('When an unexpected error occurs while applying the tier, then an error indicating so is thrown', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const maxSpaceBytes = 100;
        const mockedTier = newTier();

        jest.spyOn(tiersService, 'applyTier').mockRejectedValue(unexpectedError);
        await expect(
          licenseCodesService.applyProductFeatures({
            user,
            customer: mockedCustomer,
            logger: mockedLogger,
            maxSpaceBytes,
            tierProduct: mockedTier,
          }),
        ).rejects.toThrow(unexpectedError);
      });
    });
  });
});
