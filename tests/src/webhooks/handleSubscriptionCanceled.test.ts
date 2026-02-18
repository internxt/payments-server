import { TierNotFoundError } from '../../../src/services/tiers.service';
import { FastifyBaseLogger } from 'fastify';
import { getCreatedSubscription, getCustomer, getLogger, getProduct, getUser, newTier } from '../fixtures';
import handleSubscriptionCanceled from '../../../src/webhooks/handleSubscriptionCanceled';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { createTestServices } from '../helpers/services-factory';
import { stripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { Customer } from '../../../src/infrastructure/domain/entities/customer';

jest.mock('../../../src/webhooks/utils/handleCancelPlan');

const logger: jest.Mocked<FastifyBaseLogger> = getLogger();

const { paymentService, usersService, storageService, cacheService, objectStorageService, tiersService } =
  createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Process when a subscription is cancelled', () => {
  it('When the cancellation of a subscription that have Tier is requested, then it is cancelled successfully', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();

    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const getCustomerSPy = jest
      .spyOn(stripePaymentsAdapter, 'getCustomer')
      .mockResolvedValue(Customer.toDomain(mockedCustomer));
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
    );

    expect(getProductSpy).toHaveBeenCalledWith(mockedSubscription.items.data[0].price.product);
    expect(getCustomerSPy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(handleCancelPlan).toHaveBeenCalledWith({
      customerId: mockedSubscription.customer,
      customerEmail: mockedCustomer.email,
      productId: mockedSubscription.items.data[0].price.product,
      usersService,
      tiersService,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const mockedFreeTier = newTier({
      featuresPerService: {
        drive: {
          maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
          foreignTierId: 'free',
        },
      } as any,
    });
    const tierNotFoundError = new TierNotFoundError('Tier not found');

    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const getCustomerSPy = jest
      .spyOn(stripePaymentsAdapter, 'getCustomer')
      .mockResolvedValue(Customer.toDomain(mockedCustomer));
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockResolvedValue();
    (handleCancelPlan as jest.Mock).mockRejectedValue(tierNotFoundError);

    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
    );

    expect(getProductSpy).toHaveBeenCalledWith(mockedSubscription.items.data[0].price.product);
    expect(getCustomerSPy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(handleCancelPlan).rejects.toThrow(tierNotFoundError);
    expect(changeStorageSpy).toHaveBeenCalledWith(
      mockedUser.uuid,
      mockedFreeTier.featuresPerService.drive.maxSpaceBytes,
      mockedFreeTier.featuresPerService.drive.foreignTierId,
    );
  });

  it('When the cancellation of a subscription has a Tier but an unknown error occurs, then an error indicating so is thrown', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const randomError = new Error('Tier not found');

    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(stripePaymentsAdapter, 'getCustomer').mockResolvedValue(Customer.toDomain(mockedCustomer));
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    (handleCancelPlan as jest.Mock).mockRejectedValue(randomError);

    await expect(
      handleSubscriptionCanceled(
        storageService,
        usersService,
        paymentService,
        mockedSubscription,
        cacheService,
        objectStorageService,
        tiersService,
      ),
    ).rejects.toThrow(randomError);
  });
});
