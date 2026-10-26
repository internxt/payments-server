import { TierNotFoundError } from '../../../src/services/tiers.service';
import { getCharge, getInvoice, getUser, newTier } from '../fixtures';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { createTestServices } from '../helpers/services-factory';
import { getStripeNewVersion } from '../../../src/services/stripe';

jest.mock('../../../src/webhooks/utils/handleCancelPlan');

const { paymentService, usersService, storageService, tiersService, cacheService, preCreatedUserService } =
  createTestServices();
const stripeNewVersion = getStripeNewVersion();

const mockRefundedInvoice = (invoiceId?: string) => {
  const invoiceLineItems = getInvoice().lines;
  jest
    .spyOn(stripeNewVersion.invoicePayments, 'list')
    .mockResolvedValue({ data: invoiceId ? [{ invoice: invoiceId }] : [] } as any);
  const listLineItems = jest
    .spyOn(stripeNewVersion.invoices, 'listLineItems')
    .mockResolvedValue(invoiceLineItems as any);
  return { invoiceLineItems, listLineItems };
};

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Process when a lifetime is refunded', () => {
  it('When the refund of a lifetime that have Tier is requested, then it is refunded successfully', async () => {
    const mockedUser = getUser({ lifetime: true });
    const mockedCharge = getCharge({ payment_intent: 'pi_refunded' });

    const { invoiceLineItems, listLineItems } = mockRefundedInvoice('in_refunded');
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);

    await handleLifetimeRefunded(
      storageService,
      usersService,
      mockedCharge,
      cacheService,
      paymentService,
      tiersService,
      preCreatedUserService,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(listLineItems).toHaveBeenCalledWith('in_refunded', expect.anything());
    expect(handleCancelPlan).toHaveBeenCalledWith({
      customerId: mockedCharge.customer,
      customerEmail: mockedCharge.receipt_email,
      productId: invoiceLineItems.data[0].pricing?.price_details?.product,
      isLifetime: mockedUser.lifetime,
      usersService: usersService,
      tiersService: tiersService,
      preCreatedUserService,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedUser = getUser();
    const mockedCharge = getCharge({ payment_intent: 'pi_refunded' });
    const mockedFreeTier = newTier({
      featuresPerService: {
        drive: {
          maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
          foreignTierId: 'free',
        },
      } as any,
    });

    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
    const { listLineItems } = mockRefundedInvoice('in_refunded');
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
      preCreatedUserService,
    );

    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
    expect(listLineItems).toHaveBeenCalledWith('in_refunded', expect.anything());
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
    const mockedCharge = getCharge({ payment_intent: 'pi_refunded' });

    mockRefundedInvoice('in_refunded');
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    (handleCancelPlan as jest.Mock).mockRejectedValue(randomError);

    await expect(
      handleLifetimeRefunded(
        storageService,
        usersService,
        mockedCharge,
        cacheService,
        paymentService,
        tiersService,
        preCreatedUserService,
      ),
    ).rejects.toThrow(randomError);
  });

  test('When the refunded charge does not belong to an invoice, then no plan is removed', async () => {
    const mockedCharge = getCharge({ payment_intent: 'pi_refunded' });
    const { listLineItems } = mockRefundedInvoice();
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID');

    await handleLifetimeRefunded(
      storageService,
      usersService,
      mockedCharge,
      cacheService,
      paymentService,
      tiersService,
      preCreatedUserService,
    );

    expect(listLineItems).not.toHaveBeenCalled();
    expect(findUserByCustomerIdSpy).not.toHaveBeenCalled();
    expect(handleCancelPlan).not.toHaveBeenCalled();
  });
});
