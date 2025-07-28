import axios, { AxiosError, AxiosResponse } from 'axios';

import envVariablesConfig from '../../../src/config';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { getCurrencies, getPayloadForCryptoInvoice } from '../fixtures';
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

  describe('Check if the currency is allowed', () => {
    test('When the currency is allowed, then true is returned indicating so', () => {
      const result = bit2MeService.isAllowedCurrency('BTC');
      expect(result).toBeTruthy();
    });

    test('When the currency is not allowed, then false is returned indicating so', () => {
      const result = bit2MeService.isAllowedCurrency('EUR');
      expect(result).toBeFalsy();
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
});
