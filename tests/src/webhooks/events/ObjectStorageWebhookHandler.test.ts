import Stripe from 'stripe';
import axios from 'axios';
import { PaymentService } from '../../../../src/services/payment.service';
import { StorageService } from '../../../../src/services/storage.service';
import { UsersService } from '../../../../src/services/users.service';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import CacheService from '../../../../src/services/cache.service';
import { ObjectStorageService } from '../../../../src/services/objectStorage.service';
import { ObjectStorageWebhookHandler } from '../../../../src/webhooks/events/ObjectStorageWebhookHandler';
import { TiersService } from '../../../../src/services/tiers.service';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import { getCustomer, getInvoice, getLogger, getProduct } from '../../fixtures';

jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    disconnect: jest.fn(),
    quit: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let tierRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let cacheService: CacheService;
let stripe: Stripe;
let objectStorageService: ObjectStorageService;
let objectStorageWebhookHandler: ObjectStorageWebhookHandler;
let tiersService: TiersService;

describe('Object Storage Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripe = new Stripe('mock-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    tierRepository = testFactory.getTiersRepository();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    productsRepository = testFactory.getProductsRepositoryForTest();

    cacheService = new CacheService(config);
    storageService = new StorageService(config, axios);
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(stripe, productsRepository, bit2MeService);

    usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
      config,
      axios,
    );

    tiersService = new TiersService(
      usersService,
      paymentService,
      tierRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    objectStorageService = new ObjectStorageService(paymentService, config, axios);
    objectStorageWebhookHandler = new ObjectStorageWebhookHandler(objectStorageService, paymentService, getLogger());
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Is An Object Storage Product', () => {
    test('When the product is an object storage type, then it should return true', () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });

      const mockedObjectStorageWebhookHandler =
        objectStorageWebhookHandler['isObjectStorageProduct'].bind(objectStorageWebhookHandler);

      const isObjectStorageProduct = mockedObjectStorageWebhookHandler(mockedProduct);

      expect(isObjectStorageProduct).toBeTruthy();
    });

    test('When the product is not an object storage type, then it should return false', () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'not-object-storage',
          },
        },
      });

      const mockedObjectStorageWebhookHandler =
        objectStorageWebhookHandler['isObjectStorageProduct'].bind(objectStorageWebhookHandler);
      const isObjectStorageProduct = mockedObjectStorageWebhookHandler(mockedProduct);

      expect(isObjectStorageProduct).toBeFalsy();
    });
  });

  describe('Reactivate Object Storage Account', () => {
    test('When the invoice is an object storage invoice, then it should reactivate the account if needed', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const objectStorageServiceSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockResolvedValue();

      await objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice);

      expect(objectStorageServiceSpy).toHaveBeenCalledWith({ customerId: mockedCustomer.id });
    });

    test('When there are more line items in the invoice, then logs the error and skips to the next process', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const objectStorageServiceSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockResolvedValue();

      const loggerSpy = jest.spyOn(objectStorageWebhookHandler['log'], 'info');

      await objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Invoice ${mockedInvoice.id} not handled by object-storage handler due to lines length`,
      );

      expect(objectStorageServiceSpy).not.toHaveBeenCalled();
    });

    test('When there is not a product in the line item, then logs the error and skips to the next process', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
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
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const objectStorageServiceSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockResolvedValue();
      const loggerSpy = jest.spyOn(objectStorageWebhookHandler['log'], 'info');

      await objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice);

      expect(loggerSpy).toHaveBeenCalledWith(
        `The price or the product for the invoice with ID ${mockedInvoice.id} are null.`,
      );

      expect(objectStorageServiceSpy).not.toHaveBeenCalled();
    });

    test('When the product is not an object storage product, then logs the error and skips to the next process', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'not-object-storage',
          },
        },
      });
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const objectStorageServiceSpy = jest.spyOn(objectStorageService, 'reactivateAccount').mockResolvedValue();

      const loggerSpy = jest.spyOn(objectStorageWebhookHandler['log'], 'info');

      await objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Invoice ${mockedInvoice.id} for product ${mockedInvoice.lines.data[0].price?.product} is not an object-storage product`,
      );

      expect(objectStorageServiceSpy).not.toHaveBeenCalled();
    });

    test('When an error occurs while reactivating the account, then an error indicating so is thrown', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });

      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      jest.spyOn(objectStorageService, 'reactivateAccount').mockRejectedValue(new Error('Reactivation failed'));

      await expect(
        objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice),
      ).rejects.toThrow(new Error('Reactivation failed'));
    });

    test('When the object is not found while reactivating the account, then logs the error and skips to the next process', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);

      const axiosError = new Error('Not Found') as any;
      axiosError.response = { status: 404 };
      axiosError.isAxiosError = true;

      jest.spyOn(objectStorageService, 'reactivateAccount').mockRejectedValue(axiosError);

      const isAxiosErrorSpy = jest.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);

      const loggerSpy = jest.spyOn(objectStorageWebhookHandler['log'], 'info');

      await expect(
        objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice),
      ).resolves.not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Object storage user ${mockedCustomer.email} (customer ${mockedCustomer.id}) was not found while reactivating`,
      );

      isAxiosErrorSpy.mockRestore();
    });

    test('When an unexpected error occurs while reactivating the account, then an error indicating so is thrown', async () => {
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              price: {
                product: mockedProduct.id,
              },
            },
          ],
        },
      });

      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);

      const axiosError = new Error('Internal Server Error') as any;
      axiosError.response = { status: 500 };
      axiosError.isAxiosError = true;

      jest.spyOn(objectStorageService, 'reactivateAccount').mockRejectedValue(axiosError);

      const isAxiosErrorSpy = jest.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);

      await expect(
        objectStorageWebhookHandler.reactivateObjectStorageAccount(mockedCustomer, mockedInvoice),
      ).rejects.toThrow('Internal Server Error');

      isAxiosErrorSpy.mockRestore();
    });
  });
});
