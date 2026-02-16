import axios from 'axios';
import { KlaviyoTrackingService, KlaviyoEvent } from '../../../src/services/klaviyo.service';
import Logger from '../../../src/Logger';
import config from '../../../src/config';
import { BadRequestError } from '../../../src/errors/Errors';

jest.mock('axios');
jest.mock('../../../src/Logger');
jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    KLAVIYO_API_KEY: 'pk_test_12345',
    KLAVIYO_BASE_URL: 'https://a.klaviyo.com/api',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedLogger = Logger as jest.Mocked<typeof Logger>;

describe('KlaviyoTrackingService', () => {
  let service: KlaviyoTrackingService;
  const mockApiKey = 'pk_test_12345';
  const mockBaseUrl = 'https://a.klaviyo.com/api';

  beforeEach(() => {
    jest.clearAllMocks();
    (config as any).KLAVIYO_API_KEY = mockApiKey;
    (config as any).KLAVIYO_BASE_URL = mockBaseUrl;
    service = new KlaviyoTrackingService();
  });

  describe('Initialization', () => {
    test('When instantiated without an API Key in config, then it throws an error', () => {
      (config as any).KLAVIYO_API_KEY = undefined;
      expect(() => new KlaviyoTrackingService()).toThrow(BadRequestError);
    });

    test('When instantiated with valid config, then it initializes correctly', () => {
      expect(() => new KlaviyoTrackingService()).not.toThrow();
    });
  });

  describe('Tracking Subscription Cancelled', () => {
    test('When tracking a cancellation, then it sends the correct payload to Klaviyo', async () => {
      const email = 'user@example.com';
      const expectedUrl = `${mockBaseUrl}/events/`;
      
      const expectedPayload = {
        data: {
          type: 'event',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: { email },
              },
            },
            metric: {
              data: {
                type: 'metric',
                attributes: { name: KlaviyoEvent.SubscriptionCancelled },
              },
            },
          },
        },
      };

      const expectedHeaders = {
        headers: {
          Authorization: `Klaviyo-API-Key ${mockApiKey}`,
          'Content-Type': 'application/json',
          revision: '2024-10-15',
        },
      };

      mockedAxios.post.mockResolvedValue({ data: { status: 'ok' } });

      await service.trackSubscriptionCancelled(email);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(expectedUrl, expectedPayload, expectedHeaders);
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`[Klaviyo] ${KlaviyoEvent.SubscriptionCancelled} tracked for ${email}`)
      );
    });

    test('When axios fails, then the error is logged and re-thrown', async () => {
      const email = 'error@example.com';
      const errorMessage = 'Network Error';
      const error = new Error(errorMessage);

      mockedAxios.post.mockRejectedValue(error);

      await expect(service.trackSubscriptionCancelled(email)).rejects.toThrow(errorMessage);
      
      expect(mockedLogger.error).toHaveBeenCalledWith(
        `[Klaviyo] ${KlaviyoEvent.SubscriptionCancelled} failed for ${email}:`,
        errorMessage
      );
    });
  });
});