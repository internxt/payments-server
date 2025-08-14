import Stripe from 'stripe';
import axios from 'axios';
import { getCustomer, getInvoice, getProduct } from '../../fixtures';
import Logger from '../../../../src/Logger';
import { createTestServices } from '../../helpers/services-factory';

const { objectStorageWebhookHandler, paymentService, objectStorageService } = createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('Object Storage Webhook Handler', () => {
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

      const loggerSpy = jest.spyOn(Logger, 'info');

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
      const loggerSpy = jest.spyOn(Logger, 'info');

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

      const loggerSpy = jest.spyOn(Logger, 'info');

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
      const loggerSpy = jest.spyOn(Logger, 'info');

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
