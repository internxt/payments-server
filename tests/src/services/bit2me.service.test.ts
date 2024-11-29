import axios from 'axios';

import envVariablesConfig from '../../../src/config';
import { Bit2MeService } from '../../../src/services/bit2me.service';

let bit2MeService: Bit2MeService;

describe('Bit2Me Service tests', () => {
  beforeEach(() => {
    bit2MeService = new Bit2MeService(
      envVariablesConfig,
      axios
    );
  });

  describe('Getting currencies', () => {
    it('When asking for them, then the currencies are listed', async () => {
      const currencies = [
        {
          currencyId: 'BTC',
          name: 'Bitcoin',
          type: 'crypto',
          receiveType: true,
          networks: [{
            platformId: 'bitcoin',
            name: 'bitcoin'
          }],
          imageUrl: 'https://some-image.jpg'
        },
      ];

      jest
        .spyOn(axios, 'request')
        .mockImplementation(() => Promise.resolve({ data: currencies }));

      const received = await bit2MeService.getCurrencies();

      expect(received).toStrictEqual(currencies);
    });
  });
});
