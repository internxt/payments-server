import { UserSubscription } from '../core/users/User';
import Redis from 'ioredis';
import { type AppConfig } from '../config';

const SUBSCRIPTION_EXPIRATION_IN_SECONDS = 15 * 60;

export default class CacheService {
  private readonly redis: Redis;
  constructor(config: AppConfig) {
    this.redis = config.NODE_ENV === 'production'
    ? new Redis({ host: config.REDIS_HOST, password: config.REDIS_PASSWORD })
    : new Redis({ host: config.REDIS_HOST});
  }

  private buildSubscriptionKey(customerId: string): string {
    return `subscription-${customerId}`;
  }

  async getSubscription(customerId: string): Promise<UserSubscription | null> {
    const cachedSubscription = await this.redis.get(this.buildSubscriptionKey(customerId));

    if (!cachedSubscription) {
      return null;
    } else {
      return JSON.parse(cachedSubscription);
    }
  }

  async setSubscription(customerId: string, subscription: UserSubscription): Promise<void> {
    await this.redis.set(
      this.buildSubscriptionKey(customerId),
      JSON.stringify(subscription),
      'EX',
      SUBSCRIPTION_EXPIRATION_IN_SECONDS,
    );
  }

  async clearSubscription(customerId: string): Promise<void> {
    await this.redis.del(this.buildSubscriptionKey(customerId));
  }
}
