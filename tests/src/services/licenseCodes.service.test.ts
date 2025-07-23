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
import { UsersService } from '../../../src/services/users.service';
import { StorageService } from '../../../src/services/storage.service';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import config from '../../../src/config';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { getCustomer, getLicenseCode, getLogger, getProduct, getUser, newTier } from '../fixtures';
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
    licenseCodesService = new LicenseCodesService(
      paymentService,
      usersService,
      storageService,
      licenseCodesRepository,
      tiersService,
    );
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

  describe('Get Tier product', () => {
    test('When the tier exists by product id, then it returns the tier correctly', async () => {
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedProduct = getProduct({
        params: { id: mockedTier.productId },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const getTierProduct = licenseCodesService['getTierProduct'].bind(licenseCodesService);
      const result = await getTierProduct(mockedLicenseCode);

      expect(result).toStrictEqual(mockedTier);
    });

    test('When the tier does not exist, then it returns null', async () => {
      const tierNotFoundError = new TierNotFoundError('Tier not found');
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedProduct = getProduct({
        params: { id: mockedTier.productId },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);
      const getTierProduct = licenseCodesService['getTierProduct'].bind(licenseCodesService);
      const result = await getTierProduct(mockedLicenseCode);

      expect(result).toBeNull();
    });

    test('When an unexpected error occurs while getting the product, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Product error');
      const mockedLicenseCode = getLicenseCode();

      jest.spyOn(paymentService, 'getProduct').mockRejectedValue(unexpectedError);
      const getTierProduct = licenseCodesService['getTierProduct'].bind(licenseCodesService);

      await expect(getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
    });

    test('When an unexpected error occurs while getting the tier, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Product error');
      const mockedTier = newTier();
      const mockedLicenseCode = getLicenseCode();
      const mockedProduct = getProduct({
        params: { id: mockedTier.productId },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);
      const getTierProduct = licenseCodesService['getTierProduct'].bind(licenseCodesService);

      await expect(getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
    });
  });

  describe('Apply redeemed codes', () => {
    describe('Redeemed code with no tier', () => {
      test('When the user redeems a valid code, then only the storage is updated', async () => {
        const mockedProduct = getProduct({});
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const maxSpaceBytes = 100;

        jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        const updateStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();

        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await applyProductFeatures(user, mockedCustomer, mockedLogger, maxSpaceBytes, null);

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
        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await expect(applyProductFeatures(user, mockedCustomer, mockedLogger, maxSpaceBytes, null)).rejects.toThrow(
          unexpectedError,
        );
      });
    });

    describe('Redeemed code with tier', () => {
      test('When the user redeems a valid code that match with any tier, then all the features have been applied', async () => {
        const mockedProduct = getProduct({});
        const mockedCustomer = getCustomer();
        const mockedLogger = getLogger();
        const mockedUser = getUser();
        const user = {
          uuid: mockedUser.uuid,
          email: mockedCustomer.email as string,
        };
        const mockedTier = newTier();

        jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        const applyTierSpy = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);
        jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await applyProductFeatures(user, mockedCustomer, mockedLogger, 100, mockedTier);

        expect(applyTierSpy).toHaveBeenCalledWith(user, mockedCustomer, 1, mockedTier.id, mockedLogger);
      });

      test('When the user does not have any tier, then the tier-user relationship is inserted into the collection after applying the features', async () => {
        const mockedProduct = getProduct({});
        const mockedLicenseCode = getLicenseCode();
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

        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await applyProductFeatures(user, mockedCustomer, mockedLogger, 100, mockedTier);

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

        jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedUserTier]);
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser');
        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();

        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await applyProductFeatures(user, mockedCustomer, mockedLogger, 100, mockedTier);

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
        const applyProductFeatures = licenseCodesService['applyProductFeatures'].bind(licenseCodesService);
        await expect(
          applyProductFeatures(user, mockedCustomer, mockedLogger, maxSpaceBytes, mockedTier),
        ).rejects.toThrow(unexpectedError);
      });
    });
  });
});
