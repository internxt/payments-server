import axios from 'axios';
import { verifyRecaptcha } from '../../../src/utils/verifyRecaptcha';
import config from '../../../src/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    RECAPTCHA_V3_ENDPOINT: 'https://www.google.com/recaptcha/api/siteverify',
    RECAPTCHA_V3: 'test-secret-key',
    RECAPTCHA_V3_SCORE_THRESHOLD: 0.5,
  },
  isProduction: true,
}));

describe('Validate Captcha token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (config as any).isProduction = true;
  });

  test('When the token is valid, then it should return true', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.9,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await verifyRecaptcha('valid-token');

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      config.RECAPTCHA_V3_ENDPOINT,
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

    await expect(verifyRecaptcha('invalid-token')).rejects.toThrow('invalid-input-response');
  });

  test('When score is below threshold, then it should throw error', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.3,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(verifyRecaptcha('low-score-token')).rejects.toThrow('Score 0.3 under 0.5');
  });

  test('When score equals threshold, then it should return true', async () => {
    const mockResponse = {
      data: {
        success: true,
        score: 0.5,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await verifyRecaptcha('threshold-token');

    expect(result).toBe(true);
  });

  test('When custom threshold is set, then it should use custom value', async () => {
    (config as any).RECAPTCHA_V3_SCORE_THRESHOLD = 0.7;

    const mockResponse = {
      data: {
        success: true,
        score: 0.6,
      },
    };

    mockedAxios.post.mockResolvedValue(mockResponse);

    await expect(verifyRecaptcha('below-custom-threshold')).rejects.toThrow('Score 0.6 under 0.7');
  });

  test('When axios request fails, then it should throw network error', async () => {
    const networkError = new Error('Network Error');
    mockedAxios.post.mockRejectedValue(networkError);

    await expect(verifyRecaptcha('network-fail-token')).rejects.toThrow('Network Error');
  });
});
