import axios from 'axios';
import { verifyTurnstile } from '../../../src/utils/verifyTurnstile';
import config from '../../../src/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    TURNSTILE_ENDPOINT: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    TURNSTILE_SECRET: 'test-secret-key',
  },
  isProduction: true,
}));

describe('Validate Turnstile token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (config as any).isProduction = true;
  });

  test('When the token is valid, then it should return true', async () => {
    const mockResponse = {
      data: {
        success: true,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await verifyTurnstile('valid-token');

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      config.TURNSTILE_ENDPOINT,
      'secret=test-secret-key&response=valid-token',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  });

  test('When a remote IP is provided, then it should be forwarded to Cloudflare', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: true } });

    await verifyTurnstile('valid-token', '203.0.113.5');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      config.TURNSTILE_ENDPOINT,
      'secret=test-secret-key&response=valid-token&remoteip=203.0.113.5',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  });

  test('When Cloudflare responds with success false, then it should throw error', async () => {
    const mockResponse = {
      data: {
        success: false,
        'error-codes': ['invalid-input-response'],
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(verifyTurnstile('invalid-token')).rejects.toThrow('invalid-input-response');
  });

  test('When axios request fails, then it should throw network error', async () => {
    const networkError = new Error('Network Error');
    mockedAxios.post.mockRejectedValue(networkError);

    await expect(verifyTurnstile('network-fail-token')).rejects.toThrow('Network Error');
  });

  describe('Exponential backoff on transient network errors', () => {
    const eaiAgainError = () => Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });

    beforeEach(() => {
      jest.useFakeTimers();
      mockedAxios.isAxiosError.mockReturnValue(true);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('When the request fails with a network error and then succeeds, then it retries and returns true', async () => {
      mockedAxios.post.mockRejectedValueOnce(eaiAgainError()).mockResolvedValueOnce({ data: { success: true } });

      const resultPromise = verifyTurnstile('valid-token');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    test('When the network error persists across all attempts, then it retries up to the max and throws', async () => {
      mockedAxios.post.mockRejectedValue(eaiAgainError());

      const resultPromise = verifyTurnstile('valid-token');
      const expectation = expect(resultPromise).rejects.toThrow('EAI_AGAIN');
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    test('When the network error is not transient, then an error indicating so is thrown', async () => {
      const otherError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      mockedAxios.post.mockRejectedValue(otherError);

      const resultPromise = verifyTurnstile('valid-token');
      const expectation = expect(resultPromise).rejects.toThrow('connection refused');
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    test('When a validation error occurs (non-axios), then it does not retry', async () => {
      mockedAxios.isAxiosError.mockReturnValue(false);
      const errorCode = 'invalid-input-response';
      mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': [errorCode] } });

      const resultPromise = verifyTurnstile('invalid-token');
      const expectation = expect(resultPromise).rejects.toThrow(errorCode);
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
