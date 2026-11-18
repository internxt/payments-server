import axios from 'axios';
import { verifyRecaptcha } from '../../../src/utils/verifyRecaptcha';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const recaptchaConfig = {
  RECAPTCHA_V3_ENDPOINT: 'https://www.google.com/recaptcha/api/siteverify',
  RECAPTCHA_V3: 'test-secret-key',
  RECAPTCHA_V3_SCORE_THRESHOLD: '0.5',
  isProduction: true,
};

describe('Validate Captcha token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('When the app is not running in production, then the captcha is accepted without asking Google', async () => {
    const result = await verifyRecaptcha('any-token', { ...recaptchaConfig, isProduction: false });

    expect(result).toBe(true);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  test('When the token is valid, then it should return true', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.9,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await verifyRecaptcha('valid-token', recaptchaConfig);

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      recaptchaConfig.RECAPTCHA_V3_ENDPOINT,
      'secret=test-secret-key&response=valid-token',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  });

  test('When Google responds with success false, then it should throw error', async () => {
    const mockResponse = {
      data: {
        success: false,
        'error-codes': ['invalid-input-response'],
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(verifyRecaptcha('invalid-token', recaptchaConfig)).rejects.toThrow('invalid-input-response');
  });

  test('When score is below threshold, then it should throw error', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.3,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(verifyRecaptcha('low-score-token', recaptchaConfig)).rejects.toThrow('Score 0.3 under 0.5');
  });

  test('When score equals threshold, then it should return true', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.5,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await verifyRecaptcha('threshold-token', recaptchaConfig);

    expect(result).toBe(true);
  });

  test('When custom threshold is set, then it should use custom value', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.6,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(
      verifyRecaptcha('below-custom-threshold', { ...recaptchaConfig, RECAPTCHA_V3_SCORE_THRESHOLD: '0.7' }),
    ).rejects.toThrow('Score 0.6 under 0.7');
  });

  test('When axios request fails, then it should throw network error', async () => {
    const networkError = new Error('Network Error');
    mockedAxios.post.mockRejectedValue(networkError);

    await expect(verifyRecaptcha('network-fail-token', recaptchaConfig)).rejects.toThrow('Network Error');
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
      mockedAxios.post
        .mockRejectedValueOnce(eaiAgainError())
        .mockResolvedValueOnce({ data: { success: true, score: 0.9 } });

      const resultPromise = verifyRecaptcha('valid-token', recaptchaConfig);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    test('When the network error persists across all attempts, then it retries up to the max and throws', async () => {
      mockedAxios.post.mockRejectedValue(eaiAgainError());

      const resultPromise = verifyRecaptcha('valid-token', recaptchaConfig);
      const expectation = expect(resultPromise).rejects.toThrow('EAI_AGAIN');
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    test('When the network error is not transient, then an error indicating so is thrown', async () => {
      const otherError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      mockedAxios.post.mockRejectedValue(otherError);

      const resultPromise = verifyRecaptcha('valid-token', recaptchaConfig);
      const expectation = expect(resultPromise).rejects.toThrow('connection refused');
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    test('When a validation error occurs (non-axios), then it does not retry', async () => {
      mockedAxios.isAxiosError.mockReturnValue(false);
      const errorCode = 'invalid-input-response';
      mockedAxios.post.mockResolvedValue({ data: { success: false, 'error-codes': [errorCode] } });

      const resultPromise = verifyRecaptcha('invalid-token', recaptchaConfig);
      const expectation = expect(resultPromise).rejects.toThrow(errorCode);
      await jest.runAllTimersAsync();
      await expectation;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
