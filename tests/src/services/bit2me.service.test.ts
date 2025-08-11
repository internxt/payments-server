import axios, { AxiosError, AxiosResponse } from 'axios';

import envVariablesConfig from '../../../src/config';
import { AllowedCurrencies, Bit2MeService } from '../../../src/services/bit2me.service';
import { getCurrencies, getCryptoCurrency, getPayloadForCryptoInvoice, getRawCryptoInvoiceResponse } from '../fixtures';
import { HttpError } from '../../../src/errors/HttpError';

let bit2MeService: Bit2MeService;

describe('Bit2Me Service tests', () => {
  beforeEach(() => {
    bit2MeService = new Bit2MeService(envVariablesConfig, axios);
  });

  describe('Getting currencies', () => {
    test('When asking for them, then the currencies are listed', async () => {
      const mockedCurrencies = getCurrencies();

      jest.spyOn(axios, 'request').mockImplementation(() => Promise.resolve({ data: mockedCurrencies }));

      const received = await bit2MeService.getCurrencies();

      expect(received).toStrictEqual(mockedCurrencies);
    });

    test('When Bit2Me answers with an error, then the error is extracted and formatted', async () => {
      const error = new AxiosError('Message');
      const data = {
        statusCode: 400,
        message: ['some message'],
      };
      error.response = {
        ...error.response,
        status: 400,
        statusText: 'Bad Request',
        data,
      } as AxiosResponse<unknown, any>;

      jest.spyOn(axios, 'request').mockRejectedValue(error);

      await expect(bit2MeService.getCurrencies()).rejects.toThrow(
        new Error(`Status ${data.statusCode} received -> ${data.message.join(',')}`),
      );
    });

    test('When an external error happens, then the error is propagated', async () => {
      const error = new Error('Message');

      jest.spyOn(axios, 'request').mockRejectedValue(error);

      await expect(bit2MeService.getCurrencies()).rejects.toThrow(error);
    });
  });

  describe('Creating a Crypto Invoice', () => {
    test('When creating the invoice, then the invoice is created', async () => {
      const mockPayload = getPayloadForCryptoInvoice();
      const now = new Date().toISOString();

      const mockApiResponse = {
        invoiceId: 'invoice-abc',
        createdAt: now,
        updatedAt: now,
        priceAmount: mockPayload.priceAmount.toString(),
      };

      jest.spyOn(axios, 'request').mockResolvedValue({ data: mockApiResponse });

      const result = await bit2MeService.createCryptoInvoice(mockPayload);

      expect(result).toStrictEqual({
        ...mockApiResponse,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        priceAmount: parseFloat(mockPayload.priceAmount.toString()),
      });
    });

    test('When axios throws a controlled error (Axios error), then a controlled error is thrown', async () => {
      const mockPayload = getPayloadForCryptoInvoice();

      const mockErrorData = {
        statusCode: 400,
        message: ['Invalid amount', 'Invalid currency'],
      };

      const axiosError = new AxiosError('Bad Request');
      axiosError.response = { data: mockErrorData } as any;

      jest.spyOn(axios, 'request').mockRejectedValue(axiosError);

      await expect(bit2MeService.createCryptoInvoice(mockPayload)).rejects.toThrow(HttpError);
      await expect(bit2MeService.createCryptoInvoice(mockPayload)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Invalid amount,Invalid currency'),
      });
    });

    test('When an unknown error is thrown, then it throws the error directly without modifying it', async () => {
      const mockPayload = getPayloadForCryptoInvoice();
      const unexpectedError = new Error('Unexpected failure');

      jest.spyOn(axios, 'request').mockRejectedValue(unexpectedError);

      await expect(bit2MeService.createCryptoInvoice(mockPayload)).rejects.toThrowError('Unexpected failure');
    });
  });

  describe('Activating an invoice', () => {
    test('When the invoice is activated, then the invoice is activated and returned to allow the user to pay it', async () => {
      const rawResponse = getRawCryptoInvoiceResponse();
      const mockedCurrency = getCryptoCurrency();
      const invoiceId = rawResponse.invoiceId;
      const currencyId = AllowedCurrencies['Bitcoin'];

      jest.spyOn(bit2MeService, 'getCurrencyByCurrencyId').mockResolvedValue(mockedCurrency);
      jest.spyOn(axios, 'request').mockResolvedValue({ data: rawResponse });

      const expectedResponse = {
        ...rawResponse,
        createdAt: new Date(rawResponse.createdAt),
        updatedAt: new Date(rawResponse.updatedAt),
        expiredAt: new Date(rawResponse.expiredAt),
        priceAmount: parseFloat(rawResponse.priceAmount),
        underpaidAmount: parseFloat(rawResponse.underpaidAmount),
        overpaidAmount: parseFloat(rawResponse.overpaidAmount),
      };

      const result = await bit2MeService.checkoutInvoice(invoiceId, currencyId);

      expect(result).toStrictEqual(expectedResponse);
      expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: expect.stringContaining(`/v3/commerce/invoices/${invoiceId}/checkout`),
          data: expect.objectContaining({ currencyId }),
        }),
      );
    });
  });

  describe('Getting currency by its Id', () => {
    test('When a currency is requested by its ID, then the currency is returned', async () => {
      const mockedCryptoCurrency = getCryptoCurrency();

      jest.spyOn(axios, 'request').mockResolvedValue({ data: mockedCryptoCurrency });

      const result = await bit2MeService.getCurrencyByCurrencyId(mockedCryptoCurrency.currencyId);

      expect(result).toStrictEqual(mockedCryptoCurrency);
    });

    test('When a controlled error is thrown, then the error is thrown', async () => {
      const mockedCryptoCurrency = getCryptoCurrency();
      const controlledMessage = "platform 'bitcoin' does not support currency USD";

      const error = new AxiosError('Message');
      const data = {
        statusCode: 400,
        message: [controlledMessage],
      };
      error.response = {
        ...error.response,
        status: 400,
        statusText: 'Bad Request',
        data,
      } as AxiosResponse<unknown, any>;

      jest.spyOn(axios, 'request').mockRejectedValue(error);

      await expect(bit2MeService.getCurrencyByCurrencyId(mockedCryptoCurrency.currencyId)).rejects.toThrow(HttpError);
      await expect(bit2MeService.getCurrencyByCurrencyId(mockedCryptoCurrency.currencyId)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(controlledMessage),
      });
    });

    test('When an unknown error is thrown, then it throws the error directly without modifying it', async () => {
      const mockedCryptoCurrency = getCryptoCurrency();
      const unexpectedError = new Error('Unexpected failure');

      jest.spyOn(axios, 'request').mockRejectedValue(unexpectedError);

      await expect(bit2MeService.getCurrencyByCurrencyId(mockedCryptoCurrency.currencyId)).rejects.toThrow(
        unexpectedError,
      );
    });
  });
});
