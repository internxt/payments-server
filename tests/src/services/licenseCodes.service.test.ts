import Stripe from 'stripe';
import { InvalidLicenseCodeError, LicenseCodeAlreadyAppliedError } from '../../../src/services/licenseCodes.service';
import { UserNotFoundError } from '../../../src/services/users.service';
import { getCustomer, getLicenseCode, getUser } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';
import { paymentAdapter } from '../../../src/infrastructure/payment.adapter';

describe('Tests for License Codes service', () => {
  const { licenseCodesRepository, licenseCodesService, usersService, paymentService } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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
      const updateByCodeSpy = jest.spyOn(licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await licenseCodesService.redeem({
        code: mockedLicenseCode.code,
        provider: mockedLicenseCode.provider,
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
        },
      });

      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
      expect(getCustomerSpy).toHaveBeenCalledWith(mockedUser.customerId);
      expect(findUserByUuidSpy).toHaveBeenCalledWith(mockedUser.uuid);
      expect(subscribeSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedLicenseCode.priceId, mockedLicenseCode);
      expect(updateUserSpy).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: true,
      });
      expect(updateByCodeSpy).toHaveBeenCalledWith(mockedLicenseCode.code, { redeemed: true });
    });

    test('When the license code is valid and the customer does not exists, then the license code is marked as redeemed and the user is created', async () => {
      const mockedCustomer = getCustomer();
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedLicenseCode = getLicenseCode();

      const findOneLicenseRepositorySpy = jest
        .spyOn(licenseCodesRepository, 'findOne')
        .mockResolvedValue(mockedLicenseCode);
      const findUserByUuidSpy = jest.spyOn(usersService, 'findUserByUuid').mockRejectedValue(new UserNotFoundError());
      const createCustomerSpy = jest
        .spyOn(paymentAdapter, 'createCustomer')
        .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
      const subscribeSpy = jest.spyOn(paymentService, 'subscribe').mockResolvedValue({
        maxSpaceBytes: 100,
        recurring: false,
      });
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const updateByCodeSpy = jest.spyOn(licenseCodesRepository, 'updateByCode').mockResolvedValue(true);

      await licenseCodesService.redeem({
        code: mockedLicenseCode.code,
        provider: mockedLicenseCode.provider,
        user: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
          name: mockedCustomer.name as string,
        },
      });

      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
      expect(createCustomerSpy).toHaveBeenCalledWith({
        name: mockedCustomer.name,
        email: mockedCustomer.email,
      });
      expect(findUserByUuidSpy).toHaveBeenCalledWith(mockedUser.uuid);
      expect(subscribeSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedLicenseCode.priceId, mockedLicenseCode);
      expect(insertUserSpy).toHaveBeenCalledWith({
        customerId: mockedCustomer.id,
        uuid: mockedUser.uuid,
        lifetime: mockedUser.lifetime,
      });
      expect(updateByCodeSpy).toHaveBeenCalledWith(mockedLicenseCode.code, { redeemed: true });
    });

    test('When there is no license code, then an error indicating so is thrown', async () => {
      const invalidLicenseCodeError = new InvalidLicenseCodeError();
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode();

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
        }),
      ).rejects.toThrow(invalidLicenseCodeError);
      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
    });

    test('When the license code is already redeemed, then an error indicating so is thrown', async () => {
      const licenseCodeAlreadyAppliedError = new LicenseCodeAlreadyAppliedError();
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedLicenseCode = getLicenseCode({ redeemed: true });

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
        }),
      ).rejects.toThrow(licenseCodeAlreadyAppliedError);
      expect(findOneLicenseRepositorySpy).toHaveBeenCalledWith(mockedLicenseCode.code, mockedLicenseCode.provider);
    });
  });
});
