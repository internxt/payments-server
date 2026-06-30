import { AxiosInstance } from 'axios';
import { MailService } from '../../../src/services/mail.service';
import { AppConfig } from '../../../src/config';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('signed-jwt'),
}));

const config = {
  MAIL_URL: 'http://mail.local',
  MAIL_GATEWAY_SECRET: Buffer.from('secret').toString('base64'),
} as unknown as AppConfig;

function buildService() {
  const post = jest.fn().mockResolvedValue(undefined);
  const axios = { post } as unknown as AxiosInstance;
  const mailService = new MailService(config, axios);

  return { mailService, post };
}

describe('MailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const expectedParams = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer signed-jwt',
    },
  };

  describe('suspendAccount', () => {
    test('When called, then it POSTs to the suspend gateway endpoint with the signed token', async () => {
      const { mailService, post } = buildService();
      const uuid = 'user-uuid';

      await mailService.suspendAccount(uuid);

      expect(post).toHaveBeenCalledWith(
        `http://mail.local/gateway/accounts/${uuid}/suspend`,
        {},
        expectedParams,
      );
    });
  });

  describe('reactivateAccount', () => {
    test('When called, then it POSTs to the reactivate gateway endpoint with the signed token', async () => {
      const { mailService, post } = buildService();
      const uuid = 'user-uuid';

      await mailService.reactivateAccount(uuid);

      expect(post).toHaveBeenCalledWith(
        `http://mail.local/gateway/accounts/${uuid}/reactivate`,
        {},
        expectedParams,
      );
    });
  });
});
