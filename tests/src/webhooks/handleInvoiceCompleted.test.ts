import Stripe from 'stripe';
import handleInvoiceCompleted, {
  handleObjectStorageInvoiceCompleted,
} from '../../../src/webhooks/handleInvoiceCompleted';
import { getCustomer, getInvoice, getLogger, getPrice, getProduct, getUser, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';
import { ExtendedSubscription } from '../../../src/services/payment.service';
import { updateUserTier } from '../../../src/services/storage.service';
import { UserNotFoundError } from '../../../src/services/users.service';
import config from '../../../src/config';
import { UserType } from '../../../src/core/users/User';

jest.mock('../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../src/services/storage.service');

  return {
    ...actualModule,
    updateUserTier: jest.fn(),
  };
});

jest.mock('../../../src/services/cache.service', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(),
  };
});

jest.mock('../../../src/webhooks/handleLifetimeRefunded', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const user = getUser({ lifetime: true });
const mockStripe = {
  charges: {
    retrieve: jest.fn(),
  },
  invoices: {
    retrieve: jest.fn(),
  },
};
const {
  paymentService,
  tiersService,
  cacheService,
  usersService,
  objectStorageService,
  storageService,
  usersRepository,
} = createTestServices({
  stripe: mockStripe,
});

describe('Process when an invoice payment is completed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('When the invoice is not paid, then log a message and stop processing', async () => {
    const mockedInvoice = getInvoice({ status: 'open' });
    const log = getLogger();
    const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer');

    await handleInvoiceCompleted(
      mockedInvoice,
      usersService,
      paymentService,
      log,
      cacheService,
      tiersService,
      storageService,
      objectStorageService,
    );

    expect(getCustomerSpy).not.toHaveBeenCalled();
  });

  describe('User update', () => {
    it('When the user exists, then update their information as needed', async () => {
      const mockedUSer = getUser();
      const mockedInvoice = getInvoice({ status: 'paid' });
      const mockedCustomer = getCustomer({ id: mockedUSer.customerId });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUSer);
      const updateUserSpy = jest.spyOn(usersService, 'updateUser');
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      (updateUserTier as jest.Mock).mockResolvedValue(voidPromise);
      const getActiveSubscriptionsSpy = jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([] as ExtendedSubscription[]);

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(getActiveSubscriptionsSpy).toHaveBeenCalledTimes(1);
      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(updateUserSpy).toHaveBeenCalledWith(mockedUSer.customerId, { lifetime: mockedUSer.lifetime });
    });

    it('When the user does not exist, then create a new one', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
        email: 'user@inxt.com',
      });
      const mockedInvoice = getInvoice({ status: 'paid' });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      (updateUserTier as jest.Mock).mockResolvedValue(voidPromise);
      const getActiveSubscriptionsSpy = jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([] as ExtendedSubscription[]);

      const insertUserSpy = jest.spyOn(usersService, 'insertUser');

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(getActiveSubscriptionsSpy).toHaveBeenCalledTimes(1);
      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(usersRepository.updateUser).toHaveBeenCalledTimes(0);
      expect(insertUserSpy).toHaveBeenCalledWith({
        customerId: mockedCustomer.id,
        uuid: mockedUser.uuid,
        lifetime: false,
      });
    });

    it('When creating the user fails, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({ status: 'paid' });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});
      const userNotFoundError = new UserNotFoundError('User has been not found');
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      const insertUserError = new Error('Error while inserting the user');
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValueOnce(userNotFoundError);
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });
      jest.spyOn(usersRepository, 'insertUser').mockRejectedValueOnce(insertUserError);
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      (updateUserTier as jest.Mock).mockResolvedValue(voidPromise);
      const getActiveSubscriptionsSpy = jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([] as ExtendedSubscription[]);

      await expect(
        handleInvoiceCompleted(
          mockedInvoice,
          usersService,
          paymentService,
          getLogger(),
          cacheService,
          tiersService,
          storageService,
          objectStorageService,
        ),
      ).rejects.toThrow(insertUserError);
      expect(paymentService.getCustomer).toHaveBeenCalledTimes(1);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(1);
      expect(getActiveSubscriptionsSpy).toHaveBeenCalledTimes(1);
      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
      expect(usersRepository.insertUser).toHaveBeenCalledTimes(1);
    });

    it('When updating user executes successfully, it should be called once with correct parameters', async () => {
      const mockedInvoice = getInvoice({ status: 'paid' });
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      const handleOldInvoiceCompletedFlowSpy = jest
        .spyOn(require('../../../src/webhooks/utils/handleOldInvoiceCompletedFlow'), 'handleOldInvoiceCompletedFlow')
        .mockResolvedValue(undefined);

      const log = getLogger();

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        log,
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(handleOldInvoiceCompletedFlowSpy).toHaveBeenCalledTimes(1);
      expect(handleOldInvoiceCompletedFlowSpy).toHaveBeenCalledWith({
        config,
        customer: mockedCustomer,
        isBusinessPlan: false,
        log,
        maxSpaceBytes: mockedPrice?.metadata.maxSpaceBytes,
        product: mockedProduct,
        subscriptionSeats: mockedInvoice.lines.data[0].quantity,
        usersService: usersService,
        storageService: storageService,
        userUuid: mockedUser.uuid,
      });
    });

    it('When there is an error while updating user, then an error indicating so is thrown', async () => {
      const mockedInvoice = getInvoice({ status: 'paid' });
      const mockedCustomer = getCustomer();
      const mockedUser = getUser();
      const randomError = new Error('Something went wrong');
      const log = getLogger();
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);

      const handleOldInvoiceSpy = jest
        .spyOn(require('../../../src/webhooks/utils/handleOldInvoiceCompletedFlow'), 'handleOldInvoiceCompletedFlow')
        .mockRejectedValue(randomError);

      const logErrorSpy = jest.spyOn(log, 'error').mockImplementation();

      await expect(
        handleInvoiceCompleted(
          mockedInvoice,
          usersService,
          paymentService,
          log,
          cacheService,
          tiersService,
          storageService,
          objectStorageService,
        ),
      ).rejects.toThrow(randomError);

      expect(handleOldInvoiceSpy).toHaveBeenCalled();
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR APPLYING USER FEATURES'));
    });
  });

  describe('Invoice status', () => {
    it('When the invoice is not paid, then log a message and take no action', async () => {
      const log = getLogger();
      const fakeInvoiceCompletedSession = { status: 'open' } as unknown as Stripe.Invoice;
      jest.spyOn(paymentService, 'getCustomer');
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await handleInvoiceCompleted(
        fakeInvoiceCompletedSession,
        usersService,
        paymentService,
        log,
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(log.info).toHaveBeenCalled();
      expect(paymentService.getCustomer).toHaveBeenCalledTimes(0);
    });
  });

  describe('Customer cases', () => {
    it('When the customer is marked as deleted, then log an error and stop processing', async () => {
      const mockedInvoice = getInvoice({ status: 'paid' });
      const log = getLogger();
      const getCustomerSpy = jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue({ deleted: true, customer: user.customerId } as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems');
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        log,
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(log.error).toHaveBeenCalled();
      expect(getCustomerSpy).toHaveBeenCalledWith(mockedInvoice.customer as string);
      expect(paymentService.getInvoiceLineItems).toHaveBeenCalledTimes(0);
    });
  });

  describe('Invoice details', () => {
    it('When the invoice lacks price or product details, then log an error and stop processing', async () => {
      const log = getLogger();
      const mockedInvoice = getInvoice({
        status: 'paid',
        lines: {
          data: [],
        },
      });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(user);
      const getCustomerSpy = jest
        .spyOn(paymentService, 'getCustomer')
        .mockResolvedValue({ deleted: false, customer: user.customerId } as any);
      const getInvoiceItemsSpy = jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as any);
      const getActiveSubscriptionsSpy = jest.spyOn(paymentService, 'getActiveSubscriptions');
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        log,
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(getCustomerSpy).toHaveBeenCalledTimes(1);
      expect(getInvoiceItemsSpy).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalled();
      expect(getActiveSubscriptionsSpy).not.toHaveBeenCalled();
    });

    it('When the price metadata has no maxSpaceBytes, then log an error and stop processing', async () => {
      const mockedPrice = getPrice();
      const mockedInvoice = getInvoice({
        status: 'paid',
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: mockedPrice.id,
                  product: mockedPrice.product as string,
                },
              },
            },
          ],
        },
      });
      const log = getLogger();
      const mockedProduct = getProduct({});
      const mockedUser = getUser();

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({ deleted: false, customer: user.customerId } as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      const getActiveSubSpy = jest.spyOn(paymentService, 'getActiveSubscriptions');
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue({
        data: {
          uuid: mockedUser.uuid,
          email: 'example@inxt.com',
        },
      });

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        log,
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(mockedPrice?.metadata.maxSpaceBytes).toBeUndefined();
      expect(log.error).toHaveBeenCalled();
      expect(getActiveSubSpy).not.toHaveBeenCalled();
    });
  });

  describe('The subscription is for an object storage sub', () => {
    it('When the product is not an obj storage type, then skips to the next process', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const log = getLogger();
      const mockedProduct = getProduct({});
      const mockedPrice = getPrice();

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const reactivateObjAccountSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockImplementation();

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(reactivateObjAccountSpy).not.toHaveBeenCalled();
    });

    it('When there are more line items in the invoice, then logs the error and skips to the next process', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [],
        } as any,
      });
      const log = getLogger();

      const getProductSpy = jest.spyOn(paymentService, 'getProduct');

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(mockedInvoice.lines.data).toHaveLength(0);
      expect(log.info).toHaveBeenCalled();
      expect(getProductSpy).not.toHaveBeenCalled();
    });

    it("When there isn't a price in the line item, then logs the error and skips to the next process", async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: undefined,
                },
              },
            },
          ],
        },
      });
      const log = getLogger();
      const mockedProduct = getProduct({});
      const mockedPrice = getPrice();

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const getProductSpy = jest.spyOn(paymentService, 'getProduct');

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(getProductSpy).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalled();
      expect(mockedInvoice.lines.data).toHaveLength(1);
      expect(mockedInvoice.lines.data[0].pricing?.price_details?.product).toBeUndefined();
    });

    it('When the invoice is completed, then the object storage account is activated', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedProduct = getProduct({ userType: UserType.ObjectStorage });
      const log = getLogger();
      const mockedPrice = getPrice();

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
      const reactivateObjAccountSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockImplementation();

      await handleObjectStorageInvoiceCompleted(
        mockedCustomer,
        mockedInvoice,
        objectStorageService,
        paymentService,
        log,
      );

      expect(reactivateObjAccountSpy).toHaveBeenCalledWith({ customerId: mockedCustomer.id });
    });
  });

  describe('The user has a coupon', () => {
    it('When the user has a tracked coupon for lifetime plans, then the coupon is stored correctly', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});
      const mockedInvoice = getInvoice({
        status: 'paid',
        customer: mockedCustomer.id,

        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: mockedPrice.id,
                  product: mockedProduct.id,
                },
              },
              discounts: [
                {
                  coupon: {
                    id: 'coupon_id',
                  },
                },
              ],
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(usersRepository, 'updateUser').mockImplementation();
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      const storedCouponSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(storedCouponSpy).toHaveBeenCalledWith(mockedUser, 'coupon_id');
    });

    it('When the user has a tracked coupon for subscription plans, then the coupon is stored correctly', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedPrice = getPrice({
        metadata: {
          maxSpaceBytes: '1000',
        },
      });
      const mockedProduct = getProduct({});
      const mockedInvoice = getInvoice({
        status: 'paid',
        customer: mockedCustomer.id,

        lines: {
          data: [
            {
              pricing: {
                price_details: {
                  price: mockedPrice.id,
                  product: mockedProduct.id,
                },
              },
              discounts: [
                {
                  coupon: {
                    id: 'coupon_id',
                  },
                },
              ],
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getPrice').mockResolvedValue(mockedPrice);
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(usersRepository, 'updateUser').mockImplementation();
      const storedCouponSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await handleInvoiceCompleted(
        mockedInvoice,
        usersService,
        paymentService,
        getLogger(),
        cacheService,
        tiersService,
        storageService,
        objectStorageService,
      );

      expect(storedCouponSpy).toHaveBeenCalledWith(mockedUser, 'coupon_id');
    });
  });
});
