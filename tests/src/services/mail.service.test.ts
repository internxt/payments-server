import { AxiosError, AxiosInstance } from 'axios';
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

function axiosErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = { status } as AxiosError['response'];

  return error;
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

      expect(post).toHaveBeenCalledWith(`http://mail.local/gateway/accounts/${uuid}/suspend`, {}, expectedParams);
    });

    test('When the mail account does not exist, then the 404 is swallowed', async () => {
      const { mailService, post } = buildService();
      post.mockRejectedValue(axiosErrorWithStatus(404));

      await expect(mailService.suspendAccount('user-uuid')).resolves.toBeUndefined();
    });

    test('When the request fails with a status other than 404, then the error is rethrown', async () => {
      const { mailService, post } = buildService();
      const error = axiosErrorWithStatus(500);
      post.mockRejectedValue(error);

      await expect(mailService.suspendAccount('user-uuid')).rejects.toThrow(error);
    });

    test('When the request fails with a non-axios error, then the error is rethrown', async () => {
      const { mailService, post } = buildService();
      const error = new Error('socket hang up');
      post.mockRejectedValue(error);

      await expect(mailService.suspendAccount('user-uuid')).rejects.toThrow(error);
    });
  });

  describe('reactivateAccount', () => {
    test('When called, then it POSTs to the reactivate gateway endpoint with the signed token', async () => {
      const { mailService, post } = buildService();
      const uuid = 'user-uuid';

      await mailService.reactivateAccount(uuid);

      expect(post).toHaveBeenCalledWith(`http://mail.local/gateway/accounts/${uuid}/reactivate`, {}, expectedParams);
    });

    test('When the mail account does not exist, then the 404 is swallowed', async () => {
      const { mailService, post } = buildService();
      post.mockRejectedValue(axiosErrorWithStatus(404));

      await expect(mailService.reactivateAccount('user-uuid')).resolves.toBeUndefined();
    });

    test('When the request fails with a status other than 404, then the error is rethrown', async () => {
      const { mailService, post } = buildService();
      const error = axiosErrorWithStatus(500);
      post.mockRejectedValue(error);

      await expect(mailService.reactivateAccount('user-uuid')).rejects.toThrow(error);
    });
  });
});
