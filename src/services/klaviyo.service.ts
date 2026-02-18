import axios from 'axios';
import Logger from '../Logger';
import { BadRequestError } from '../errors/Errors';
import config from '../config';

export enum KlaviyoEvent {
  SubscriptionCancelled = 'Subscription Cancelled',
}

interface KlaviyoEventOptions {
  email: string;
  eventName: KlaviyoEvent;
}


export class KlaviyoTrackingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    if (!config.KLAVIYO_API_KEY) {
      throw new BadRequestError("Klaviyo API Key is required.");
    }

    this.apiKey = config.KLAVIYO_API_KEY;
    this.baseUrl = config.KLAVIYO_BASE_URL || 'https://a.klaviyo.com/api';
  }

  private async trackEvent(options: KlaviyoEventOptions): Promise<void> {
    const { email, eventName } = options;

    const payload = {
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
              attributes: { name: eventName },
            },
          },
        },
      },
    };

    try {
      await axios.post(`${this.baseUrl}/events/`, payload, {
        headers: {
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
          revision: '2024-10-15',
        },
      });

      Logger.info(`[Klaviyo] ${eventName} tracked for ${email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[Klaviyo] ${eventName} failed for ${email}: ${message}`);
      throw error;
    }
  }

  async trackSubscriptionCancelled(email: string): Promise<void> {
    await this.trackEvent({
      email,
      eventName: KlaviyoEvent.SubscriptionCancelled,
    });
  }
}

export const klaviyoService = new KlaviyoTrackingService();