import axios from 'axios';
import { TurnstileUnavailableError, verifyTurnstile } from '../../../src/utils/verifyTurnstile';
import config from '../../../src/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    TURNSTILE_ENDPOINT: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    TURNSTILE_SECRET: 'test-turnstile-secret',
  },
}));

describe('Validate Turnstile token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockReturnValue(false);
  });

  test('When Cloudflare accepts the token, then it should return true', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: true, challenge_ts: '2026-07-27T10:00:00Z' } });

    const result = await verifyTurnstile('valid-token');

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      config.TURNSTILE_ENDPOINT,
      'secret=test-turnstile-secret&response=valid-token',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  });

  test('When Cloudflare rejects the token, then it should throw an error naming the reason', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': ['invalid-input-response'] } });

    await expect(verifyTurnstile('invalid-token')).rejects.toThrow('invalid-input-response');
  });

  test('When the token was already spent, then it should throw instead of treating it as unavailability', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': ['timeout-or-duplicate'] } });

    const verification = verifyTurnstile('replayed-token');

    await expect(verification).rejects.toThrow('timeout-or-duplicate');
    await expect(verification).rejects.not.toBeInstanceOf(TurnstileUnavailableError);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  test('When the rejection is not retryable, then it should not ask Cloudflare again', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': ['invalid-input-secret'] } });

    await expect(verifyTurnstile('any-token')).rejects.toThrow('invalid-input-secret');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  describe('Retries on transient failures', () => {
    const eaiAgainError = () => Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('When Cloudflare reports an internal error and then accepts the token, then it should return true', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { success: false, 'error-codes': ['internal-error'] } })
        .mockResolvedValueOnce({ data: { success: true } });

      const verification = verifyTurnstile('valid-token');
      await jest.runAllTimersAsync();

      await expect(verification).resolves.toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    test('When Cloudflare keeps failing internally, then it should report the token as unverifiable', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': ['internal-error'] } });

      const verification = verifyTurnstile('valid-token');
      const expectation = expect(verification).rejects.toBeInstanceOf(TurnstileUnavailableError);
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    test('When the network fails and then recovers, then it should return true', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(eaiAgainError()).mockResolvedValueOnce({ data: { success: true } });

      const verification = verifyTurnstile('valid-token');
      await jest.runAllTimersAsync();

      await expect(verification).resolves.toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    test('When the network failure persists, then it should report the token as unverifiable', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValue(eaiAgainError());

      const verification = verifyTurnstile('valid-token');
      const expectation = expect(verification).rejects.toBeInstanceOf(TurnstileUnavailableError);
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    test('When the network error is not transient, then it should fail without retrying', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValue(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));

      const verification = verifyTurnstile('valid-token');
      const expectation = expect(verification).rejects.toThrow('connection refused');
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
