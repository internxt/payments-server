import axios from 'axios';
import { KlaviyoTrackingService, KlaviyoEvent } from '../../../src/services/klaviyo.service';
import Logger from '../../../src/Logger';
import { BadRequestError } from '../../../src/errors/Errors';
import config from '../../../src/config';
import { createTestServices } from '../helpers/services-factory';

jest.mock('axios');
jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    KLAVIYO_API_KEY: 'pk_test_12345',
    KLAVIYO_BASE_URL: 'https://a.klaviyo.com/api',
    STRIPE_SECRET_KEY: 'sk_test_12345',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;


describe('KlaviyoTrackingService', () => {
  let service: KlaviyoTrackingService;
  let loggerInfoSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const mockApiKey = 'pk_test_12345';
  const mockBaseUrl = 'https://a.klaviyo.com/api';

  beforeEach(() => {
    jest.clearAllMocks();
    loggerInfoSpy = jest.spyOn(Logger, 'info').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();

    (config as any).KLAVIYO_API_KEY = mockApiKey;
    (config as any).KLAVIYO_BASE_URL = mockBaseUrl;
    service = createTestServices({ stripe: {} as any }).klaviyoTrackingService;
  });

  describe('Initialization', () => {
    test('When instantiated without an API Key in config, then it throws an error', () => {
      (config as any).KLAVIYO_API_KEY = undefined;
      expect(() => createTestServices({ stripe: {} as any }).klaviyoTrackingService).toThrow(BadRequestError);
    });

    test('When instantiated with valid config, then it initializes correctly', () => {
      expect(() => createTestServices({ stripe: {} as any }).klaviyoTrackingService).not.toThrow();
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
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[Klaviyo] ${KlaviyoEvent.SubscriptionCancelled} tracked for ${email}`)
      );
    });

    test('When axios fails, then the error is logged and re-thrown', async () => {
      const email = 'error@example.com';
      const errorMessage = 'Network Error';
      const error = new Error(errorMessage);

      mockedAxios.post.mockRejectedValue(error);

      await expect(service.trackSubscriptionCancelled(email)).rejects.toThrow(errorMessage);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[Klaviyo] ${KlaviyoEvent.SubscriptionCancelled} failed for ${email}: ${errorMessage}`)
      );
    });
  });
});