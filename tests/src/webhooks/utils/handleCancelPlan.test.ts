import { TierNotFoundError } from '../../../../src/services/tiers.service';
import { getCustomer, getLogger, getUser, newTier, voidPromise } from '../../fixtures';
import { handleCancelPlan } from '../../../../src/webhooks/utils/handleCancelPlan';
import { createTestServices } from '../../helpers/services-factory';
import { getPreCreatedUserEntity } from '../../entity.fixtures';
import { PreCreatedUserStatus } from '../../../../src/infrastructure/domain/entities/preCreatedUser';
import { PreCreatedUserNotFoundError } from '../../../../src/errors/PreCreatedUsersErrors';

const { usersService, tiersService, preCreatedUserService } = createTestServices();

beforeEach(() => {
  jest.resetAllMocks();
  jest.clearAllMocks();
  jest.spyOn(preCreatedUserService, 'getEligibleForPayment').mockResolvedValue(getPreCreatedUserEntity());
  jest.spyOn(preCreatedUserService, 'update').mockImplementation(voidPromise);
});

describe('Handling canceled plans and refunded lifetimes', () => {
  it('When the tier id to remove the user-tier relationship does not exists, then an error indicating so is thrown', async () => {
    const mockedCustomer = getCustomer();
    const log = getLogger();
    const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: false });
    const mockedTier = newTier();
    const mockedRandomTier = newTier({
      billingType: 'subscription',
    });

    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedRandomTier);
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
    const removeTierSpy = jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
    const userTiersSpy = jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    const deleteTierFromUserSpy = jest.spyOn(tiersService, 'deleteTierFromUser');

    await expect(
      handleCancelPlan({
        customerEmail: mockedCustomer.email as string,
        customerId: mockedCustomer.id,
        productId: mockedRandomTier.productId,
        tiersService,
        usersService,
        log,
        preCreatedUserService,
      }),
    ).rejects.toThrow(TierNotFoundError);

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedRandomTier.productId,
      log,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).not.toHaveBeenCalled();
  });

  it('When the user cancels a subscription, then the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();
    const log = getLogger();
    const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: false });
    const mockedTier = newTier();

    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
    const removeTierSpy = jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
    const userTiersSpy = jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    const deleteTierFromUserSpy = jest.spyOn(tiersService, 'deleteTierFromUser').mockImplementation(voidPromise);

    await handleCancelPlan({
      customerEmail: mockedCustomer.email as string,
      customerId: mockedCustomer.id,
      productId: mockedTier.productId,
      tiersService,
      usersService,
      log,
      preCreatedUserService,
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
      log,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  it('When the user cancels a lifetime (refund), then the lifetime field is set to false, the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();
    const log = getLogger();
    const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: true });
    const mockedTier = newTier({ billingType: 'lifetime' });

    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation(async (customerId, updateData) => {
      if (customerId === mockedCustomer.id) {
        Object.assign(mockedUser, updateData);
      }
      return Promise.resolve();
    });
    const removeTierSpy = jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
    const userTiersSpy = jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    const deleteTierFromUserSpy = jest.spyOn(tiersService, 'deleteTierFromUser').mockImplementation(voidPromise);

    await handleCancelPlan({
      customerEmail: mockedCustomer.email as string,
      customerId: mockedCustomer.id,
      productId: mockedTier.productId,
      tiersService,
      usersService,
      log,
      preCreatedUserService,
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(mockedUser.lifetime).toBe(false);
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
      log,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  describe('Cancelling the pre-created user', () => {
    const setUpCancellation = () => {
      const mockedCustomer = getCustomer();
      const log = getLogger();
      const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: false });
      const mockedTier = newTier();

      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
      jest.spyOn(tiersService, 'deleteTierFromUser').mockImplementation(voidPromise);

      return {
        log,
        params: {
          customerEmail: mockedCustomer.email as string,
          customerId: mockedCustomer.id,
          productId: mockedTier.productId,
          tiersService,
          usersService,
          log,
          preCreatedUserService,
        },
      };
    };

    it('When a pre-created user is eligible for payment, then it is marked as cancelled', async () => {
      const { params } = setUpCancellation();
      const mockedPreCreatedUser = getPreCreatedUserEntity();

      jest.spyOn(preCreatedUserService, 'getEligibleForPayment').mockResolvedValue(mockedPreCreatedUser);
      const updateSpy = jest.spyOn(preCreatedUserService, 'update').mockImplementation(voidPromise);

      await handleCancelPlan(params);

      expect(updateSpy).toHaveBeenCalledWith({
        uuid: mockedPreCreatedUser.uuid,
        status: PreCreatedUserStatus.Cancelled,
      });
    });

    it('When there is no pre-created user for that email, then nothing is updated and the handler completes', async () => {
      const { params } = setUpCancellation();

      jest
        .spyOn(preCreatedUserService, 'getEligibleForPayment')
        .mockRejectedValue(new PreCreatedUserNotFoundError());
      const updateSpy = jest.spyOn(preCreatedUserService, 'update').mockImplementation(voidPromise);

      await expect(handleCancelPlan(params)).resolves.toBeUndefined();

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('When looking up the pre-created user fails for any other reason, then the error propagates and nothing is updated', async () => {
      const { params } = setUpCancellation();
      const unexpectedError = new Error('Gateway is down');

      jest.spyOn(preCreatedUserService, 'getEligibleForPayment').mockRejectedValue(unexpectedError);
      const updateSpy = jest.spyOn(preCreatedUserService, 'update').mockImplementation(voidPromise);

      await expect(handleCancelPlan(params)).rejects.toThrow(unexpectedError);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
