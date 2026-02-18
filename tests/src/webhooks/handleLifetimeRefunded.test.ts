import Stripe from 'stripe';
import { TierNotFoundError } from '../../../src/services/tiers.service';
import { getCharge, getInvoice, getUser, newTier } from '../fixtures';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { createTestServices } from '../helpers/services-factory';

jest.mock('../../../src/webhooks/utils/handleCancelPlan');

const { paymentService, usersService, storageService, tiersService, cacheService } = createTestServices();

beforeEach(() => {
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
      tiersService,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(getInvoiceLineItemsSpy).toHaveBeenCalledWith(mockedCharge.invoice);
    expect(handleCancelPlan).toHaveBeenCalledWith({
      customerId: mockedCharge.customer,
      customerEmail: mockedCharge.receipt_email,
      productId: (mockedInvoiceLineItems.data[0].price?.product as Stripe.Product).id,
      isLifetime: mockedUser.lifetime,
      usersService: usersService,
      tiersService: tiersService,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedUser = getUser();
    const mockedCharge = getCharge();
    const mockedInvoiceLineItems = getInvoice().lines;
    const mockedFreeTier = newTier({
      featuresPerService: {
        drive: {
          maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
          foreignTierId: 'free',
        },
      } as any,
    });

    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
    const getInvoiceLineItemsSpy = jest
      .spyOn(paymentService, 'getInvoiceLineItems')
      .mockResolvedValue(mockedInvoiceLineItems as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockResolvedValue();
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation();
    (handleCancelPlan as jest.Mock).mockRejectedValue(tierNotFoundError);

    await handleLifetimeRefunded(
      storageService,
      usersService,
      mockedCharge,
      cacheService,
      paymentService,
      tiersService,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(getInvoiceLineItemsSpy).toHaveBeenCalledWith(mockedCharge.invoice);
    expect(handleCancelPlan).rejects.toThrow(tierNotFoundError);
    expect(updateUserSpy).toHaveBeenCalledWith(mockedCharge.customer, { lifetime: false });
    expect(changeStorageSpy).toHaveBeenCalledWith(
      mockedUser.uuid,
      mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
      mockedFreeTier.featuresPerService.drive.foreignTierId,
    );
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
      handleLifetimeRefunded(storageService, usersService, mockedCharge, cacheService, paymentService, tiersService),
    ).rejects.toThrow(randomError);
  });
});
