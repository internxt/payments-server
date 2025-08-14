import Stripe from 'stripe';
import { UserNotFoundError } from '../../../src/services/users.service';
import { updateUserTier } from '../../../src/services/storage.service';
import config from '../../../src/config';
import handleInvoiceCompleted, {
  handleObjectStorageInvoiceCompleted,
} from '../../../src/webhooks/handleInvoiceCompleted';
import { getCustomer, getInvoice, getLogger, getProduct, getUser, voidPromise } from '../fixtures';
import { UserType } from '../../../src/core/users/User';
import { createTestServices } from '../helpers/services-factory';
import { ExtendedSubscription } from '../../../src/services/payment.service';

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
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUSer);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
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
      jest
        .spyOn(usersService, 'findUserByEmail')
        .mockResolvedValue({ data: { uuid: mockedUser.uuid, email: 'random@inxt.com' } });
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
      const userNotFoundError = new UserNotFoundError('User has been not found');
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

      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
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
        maxSpaceBytes: mockedInvoice.lines.data[0].price?.metadata.maxSpaceBytes,
        product: mockedInvoice.lines.data[0].price?.product,
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
      const fakeInvoiceCompletedSession = { status: 'paid' } as unknown as Stripe.Invoice;
      const log = getLogger();
      const mockedInvoice = getInvoice({
        lines: {} as any,
      });
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
        fakeInvoiceCompletedSession,
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
      const mockedInvoice = getInvoice({
        status: 'paid',
      });
      const log = getLogger();
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue({ deleted: false, customer: user.customerId } as any);
      if (mockedInvoice.lines.data[0].price?.metadata) {
        mockedInvoice.lines.data[0].price.metadata = {};
      }
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      const getActiveSubSpy = jest.spyOn(paymentService, 'getActiveSubscriptions');
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

      expect(mockedInvoice.lines.data[0].price?.metadata.maxSpaceBytes).toBeUndefined();
      expect(log.error).toHaveBeenCalled();
      expect(getActiveSubSpy).not.toHaveBeenCalled();
    });
  });

  describe('The subscription is for an object storage sub', () => {
    it('When the product is not an obj storage type, then skips to the next process', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedProduct = getProduct({});
      const log = getLogger();

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
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
              price: {
                product: undefined,
              },
            },
          ],
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

      expect(getProductSpy).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalled();
      expect(mockedInvoice.lines.data).toHaveLength(1);
      expect(mockedInvoice.lines.data[0].price?.product).toBeUndefined();
    });

    it('When the invoice is completed, then the object storage account is activated', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice();
      const mockedProduct = getProduct({ userType: UserType.ObjectStorage });
      const log = getLogger();

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
      const mockedInvoice = getInvoice({
        status: 'paid',
        customer: mockedCustomer.id,
        lines: {
          data: [
            {
              price: {
                id: `price_12333`,
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 102389234,
                currency: 'usd',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {
                  maxSpaceBytes: `1837284738`,
                  type: UserType.Individual,
                  planType: 'one_time',
                },
                nickname: null,
                product: {
                  id: `prod_12333`,
                  type: 'service',
                  object: 'product',
                  active: true,
                  created: 1678833149,
                  default_price: null,
                  description: null,
                  images: [],
                  marketing_features: [],
                  livemode: false,
                  metadata: {
                    type: UserType.Individual,
                  },
                  name: 'Gold Plan',
                  package_dimensions: null,
                  shippable: null,
                  statement_descriptor: null,
                  tax_code: null,
                  unit_label: null,
                  updated: 1678833149,
                  url: null,
                },
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  trial_period_days: null,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 1000,
                unit_amount_decimal: '1000',
              },
              discounts: [
                {
                  coupon: { id: 'coupon_id' },
                },
              ],
            },
          ],
        },
      } as any);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
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
      const mockedInvoice = getInvoice({
        status: 'paid',
        customer: mockedCustomer.id,
        discount: {
          coupon: { id: 'coupon_id' },
        },
        lines: {
          data: [
            {
              price: {
                id: `price_12333`,
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 102389234,
                currency: 'usd',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {
                  maxSpaceBytes: `1837284738`,
                  type: UserType.Individual,
                },
                nickname: null,
                product: {
                  id: `prod_12333`,
                  type: 'service',
                  object: 'product',
                  active: true,
                  created: 1678833149,
                  default_price: null,
                  description: null,
                  images: [],
                  marketing_features: [],
                  livemode: false,
                  metadata: {
                    type: UserType.Individual,
                  },
                  name: 'Gold Plan',
                  package_dimensions: null,
                  shippable: null,
                  statement_descriptor: null,
                  tax_code: null,
                  unit_label: null,
                  updated: 1678833149,
                  url: null,
                },
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  trial_period_days: null,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 1000,
                unit_amount_decimal: '1000',
              },
              discounts: [],
            },
          ],
        },
      } as any);
      jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
      jest.spyOn(paymentService, 'getInvoiceLineItems').mockResolvedValue(mockedInvoice.lines as any);
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      jest.spyOn(usersRepository, 'updateUser').mockImplementation();
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
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
