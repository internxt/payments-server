import Stripe from 'stripe';
import { InvalidLicenseCodeError, LicenseCodeAlreadyAppliedError } from '../../../src/services/licenseCodes.service';
import { UserNotFoundError } from '../../../src/services/users.service';
import { TierNotFoundError } from '../../../src/services/tiers.service';
import { getCustomer, getLicenseCode, getLogger, getProduct, getUser, newTier, priceById } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

describe('Tests for License Codes service', () => {
  let services: ReturnType<typeof createTestServices>;

  beforeEach(() => {
    services = createTestServices();
    jest.resetAllMocks();
  });

  describe('Check if license code is available', () => {
    test('when the license code is not redeemed, then it returns true indicating so', async () => {
      const mockedLicenseCode = getLicenseCode();
      jest.spyOn(services.licenseCodesRepository, 'findOne').mockResolvedValue(mockedLicenseCode);

      const isAvailable = await services.licenseCodesService.isLicenseCodeAvailable(
        mockedLicenseCode.code,
        mockedLicenseCode.provider,
      );
      expect(isAvailable).toBe(true);
    });

    test('When the license code is already redeemed, then an error indicating so is thrown', async () => {
      const mockedLicenseCode = getLicenseCode({ redeemed: true });
      jest.spyOn(services.licenseCodesRepository, 'findOne').mockResolvedValue(mockedLicenseCode);

      await expect(
        services.licenseCodesService.isLicenseCodeAvailable(mockedLicenseCode.code, mockedLicenseCode.provider),
      ).rejects.toThrow(LicenseCodeAlreadyAppliedError);
    });

    test('When the license code does not exist, then an error indicating so is thrown', async () => {
      jest.spyOn(services.licenseCodesRepository, 'findOne').mockResolvedValue(null);

      await expect(services.licenseCodesService.isLicenseCodeAvailable('code', 'provider')).rejects.toThrow(
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
        .spyOn(services.licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);
      const getCustomerSpy = jest
        .spyOn(services.paymentService, 'getCustomer')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      const findUserByUuidSpy = jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const subscribeSpy = jest.spyOn(services.paymentService, 'subscribe').mockResolvedValue({
        maxSpaceBytes: 100,
        recurring: false,
      });
      const updateUserSpy = jest.spyOn(services.usersService, 'updateUser').mockResolvedValue();
      const getTierProductSpy = jest
        .spyOn(services.licenseCodesService, 'getTierProduct')
        .mockResolvedValue(mockedTier);
      const applyProductFeaturesSpy = jest
        .spyOn(services.licenseCodesService, 'applyProductFeatures')
        .mockResolvedValue();
      const updateByCodeSpy = jest.spyOn(services.licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await services.licenseCodesService.redeem({
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
        .spyOn(services.licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);
      const findUserByUuidSpy = jest
        .spyOn(services.usersService, 'findUserByUuid')
        .mockRejectedValue(new UserNotFoundError());
      const createCustomerSpy = jest
        .spyOn(services.paymentService, 'createCustomer')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      const subscribeSpy = jest.spyOn(services.paymentService, 'subscribe').mockResolvedValue({
        maxSpaceBytes: 100,
        recurring: false,
      });
      const insertUserSpy = jest.spyOn(services.usersService, 'insertUser').mockResolvedValue();
      const getTierProductSpy = jest
        .spyOn(services.licenseCodesService, 'getTierProduct')
        .mockResolvedValue(mockedTier);
      const applyProductFeaturesSpy = jest
        .spyOn(services.licenseCodesService, 'applyProductFeatures')
        .mockResolvedValue();
      const updateByCodeSpy = jest.spyOn(services.licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await services.licenseCodesService.redeem({
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
        .spyOn(services.licenseCodesRepository, 'findOne')
        .mockRejectedValue(invalidLicenseCodeError);

      await expect(
        services.licenseCodesService.redeem({
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
        .spyOn(services.licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);

      await expect(
        services.licenseCodesService.redeem({
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

      jest.spyOn(services.paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      const getTierProductByProductIdSpy = jest
        .spyOn(services.tiersService, 'getTierProductsByProductsId')
        .mockResolvedValue(mockedTier);
      const result = await services.licenseCodesService.getTierProduct(mockedLicenseCode);

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

      jest.spyOn(services.paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      jest.spyOn(services.tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);
      const result = await services.licenseCodesService.getTierProduct(mockedLicenseCode);

      expect(result).toBeNull();
    });

    test('When an unexpected error occurs while getting the product, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Product error');
      const mockedLicenseCode = getLicenseCode();

      jest.spyOn(services.paymentService, 'getPriceById').mockRejectedValue(unexpectedError);

      await expect(services.licenseCodesService.getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
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

      jest.spyOn(services.paymentService, 'getPriceById').mockResolvedValue(mockedPrice);
      jest.spyOn(services.tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      await expect(services.licenseCodesService.getTierProduct(mockedLicenseCode)).rejects.toThrow(unexpectedError);
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

        const updateStorageSpy = jest.spyOn(services.storageService, 'changeStorage').mockResolvedValue();
        await services.licenseCodesService.applyProductFeatures({
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

        jest.spyOn(services.storageService, 'changeStorage').mockRejectedValue(unexpectedError);
        await expect(
          services.licenseCodesService.applyProductFeatures({
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

        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        const applyTierSpy = jest.spyOn(services.tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(services.tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(services.tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
        jest.spyOn(services.tiersService, 'insertTierToUser').mockResolvedValue();

        await services.licenseCodesService.applyProductFeatures({
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

        jest
          .spyOn(services.paymentService, 'getProduct')
          .mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(services.tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(services.tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(services.tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedUserTier]);
        const insertTierToUserSpy = jest.spyOn(services.tiersService, 'insertTierToUser').mockResolvedValue();

        await services.licenseCodesService.applyProductFeatures({
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

        jest
          .spyOn(services.paymentService, 'getProduct')
          .mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
        jest.spyOn(services.usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(services.tiersService, 'applyTier').mockResolvedValue();
        jest.spyOn(services.tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
        jest.spyOn(services.tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedUserTier]);
        const insertTierToUserSpy = jest.spyOn(services.tiersService, 'insertTierToUser');
        const updateTierToUserSpy = jest.spyOn(services.tiersService, 'updateTierToUser').mockResolvedValue();

        await services.licenseCodesService.applyProductFeatures({
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

        jest.spyOn(services.tiersService, 'applyTier').mockRejectedValue(unexpectedError);
        await expect(
          services.licenseCodesService.applyProductFeatures({
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
