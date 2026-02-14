import axios from 'axios';

interface KlaviyoEventOptions {
  email: string;
  eventName: string;
}

export class KlaviyoTrackingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string | undefined = process.env.KLAVIYO_API_KEY,
    baseUrl: string | undefined = process.env.KLAVIYO_BASE_URL
  ) {
    if (!apiKey) {
      throw new Error("Klaviyo API Key is required.");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? "";
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

      console.log(`[Klaviyo] ${eventName} tracked for ${email}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Klaviyo] ${eventName} failed for ${email}:`, message);
        throw error;
    }
  }

  async trackSubscriptionCancelled(email: string): Promise<void> {
    await this.trackEvent({
      email,
      eventName: 'Subscription Cancelled',
    });
  }
}