import { TierNotFoundError } from '../../../src/services/tiers.service';
import { FastifyBaseLogger } from 'fastify';
import { getCreatedSubscription, getCustomer, getLogger, getProduct, getUser } from '../fixtures';
import config from '../../../src/config';
import handleSubscriptionCanceled from '../../../src/webhooks/handleSubscriptionCanceled';
import { handleCancelPlan } from '../../../src/webhooks/utils/handleCancelPlan';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { createTestServices } from '../helpers/services-factory';

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
    const getCustomerSPy = jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
      logger,
      config,
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
      log: logger,
    });
  });

  it('When the cancellation of a subscription that does not have a Tier is requested, then should cancel it using the old way', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const tierNotFoundError = new TierNotFoundError('Tier not found');

    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const getCustomerSPy = jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    const findUserByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockResolvedValue();
    (handleCancelPlan as jest.Mock).mockRejectedValue(tierNotFoundError);

    await handleSubscriptionCanceled(
      storageService,
      usersService,
      paymentService,
      mockedSubscription,
      cacheService,
      objectStorageService,
      tiersService,
      logger,
      config,
    );

    expect(getProductSpy).toHaveBeenCalledWith(mockedSubscription.items.data[0].price.product);
    expect(getCustomerSPy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(findUserByCustomerIdSpy).toHaveBeenCalledWith(mockedSubscription.customer);
    expect(handleCancelPlan).rejects.toThrow(tierNotFoundError);
    expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, FREE_PLAN_BYTES_SPACE);
  });

  it('When the cancellation of a subscription has a Tier but an unknown error occurs, then an error indicating so is thrown', async () => {
    const mockedUser = getUser();
    const mockedSubscription = getCreatedSubscription();
    const mockedProduct = getProduct({});
    const mockedCustomer = getCustomer();
    const randomError = new Error('Tier not found');

    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
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
        logger,
        config,
      ),
    ).rejects.toThrow(randomError);
  });
});
