import axios, { AxiosError, AxiosResponse } from 'axios';

import envVariablesConfig from '../../../src/config';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { getCurrencies } from '../fixtures';

let bit2MeService: Bit2MeService;

describe('Bit2Me Service tests', () => {
  beforeEach(() => {
    bit2MeService = new Bit2MeService(envVariablesConfig, axios);
  });

  describe('Getting currencies', () => {
    it('When asking for them, then the currencies are listed', async () => {
      const mockedCurrencies = getCurrencies();

      jest.spyOn(axios, 'request').mockImplementation(() => Promise.resolve({ data: mockedCurrencies }));

      const received = await bit2MeService.getCurrencies();

      expect(received).toStrictEqual(mockedCurrencies);
    });

    it('When Bit2Me answers with an error, then the error is extracted and formatted', async () => {
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

    it('When an external error happens, then the error is propagated', async () => {
      const error = new Error('Message');

      jest.spyOn(axios, 'request').mockRejectedValue(error);

      await expect(bit2MeService.getCurrencies()).rejects.toThrow(error);
    });
  });
});
