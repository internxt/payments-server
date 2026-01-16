import { TierNotFoundError } from '../../../../src/services/tiers.service';
import { getCustomer, getUser, newTier, voidPromise } from '../../fixtures';
import { handleCancelPlan } from '../../../../src/webhooks/utils/handleCancelPlan';
import { createTestServices } from '../../helpers/services-factory';

const { usersService, tiersService } = createTestServices();

beforeEach(() => {
  jest.resetAllMocks();
  jest.clearAllMocks();
});

describe('Handling canceled plans and refunded lifetimes', () => {
  it('When the tier id to remove the user-tier relationship does not exists, then an error indicating so is thrown', async () => {
    const mockedCustomer = getCustomer();

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
      }),
    ).rejects.toThrow(TierNotFoundError);

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedRandomTier.productId,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).not.toHaveBeenCalled();
  });

  it('When the user cancels a subscription, then the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();

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
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  it('When the user cancels a lifetime (refund), then the lifetime field is set to false, the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();

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
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(mockedUser.lifetime).toBe(false);
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
    );
    expect(userTiersSpy).toHaveBeenCalledWith(mockedUser.id);
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });
});
