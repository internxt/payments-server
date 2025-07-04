import { UserSubscription, UserType } from '../core/users/User';
import Redis from 'ioredis';
import { type AppConfig } from '../config';

const SUBSCRIPTION_EXPIRATION_IN_SECONDS = 15 * 60;
const USED_COUPON_CODES_EXPIRATION_IN_SECONDS = 6 * 60 * 60;

export default class CacheService {
  private readonly redis: Redis;
  constructor(config: AppConfig) {
    this.redis =
      config.NODE_ENV === 'production'
        ? new Redis({ host: config.REDIS_HOST, password: config.REDIS_PASSWORD })
        : new Redis({ host: config.REDIS_HOST });
  }

  private buildSubscriptionKey(customerId: string, userType: UserType = UserType.Individual): string {
    return `subscription-${customerId}-${userType}`;
  }

  private buildUsedPromoCodesKey(customerId: string): string {
    return `used-promotion-codes-${customerId}`;
  }

  async getSubscription(
    customerId: string,
    userType: UserType = UserType.Individual,
  ): Promise<UserSubscription | null> {
    const cachedSubscription = await this.redis.get(this.buildSubscriptionKey(customerId, userType));

    if (!cachedSubscription) {
      return null;
    } else {
      return JSON.parse(cachedSubscription);
    }
  }

  async getUsedUserPromoCodes(customerId: string): Promise<string[] | null> {
    const cachedUsedPromoCodesByUser = await this.redis.get(this.buildUsedPromoCodesKey(customerId));

    if (!cachedUsedPromoCodesByUser) {
      return null;
    } else {
      return JSON.parse(cachedUsedPromoCodesByUser) as string[];
    }
  }

  async setSubscription(customerId: string, userType: UserType, subscription: UserSubscription): Promise<void> {
    await this.redis.set(
      this.buildSubscriptionKey(customerId, userType),
      JSON.stringify(subscription),
      'EX',
      SUBSCRIPTION_EXPIRATION_IN_SECONDS,
    );
  }

  async setUsedUserPromoCodes(customerId: string, promoCodes: string[]): Promise<void> {
    await this.redis.set(
      this.buildUsedPromoCodesKey(customerId),
      JSON.stringify(promoCodes),
      'EX',
      USED_COUPON_CODES_EXPIRATION_IN_SECONDS,
    );
  }

  async clearSubscription(customerId: string, userType: UserType = UserType.Individual): Promise<void> {
    await this.redis.del(this.buildSubscriptionKey(customerId, userType));
  }

  async clearUsedUserPromoCodes(customerId: string): Promise<void> {
    await this.redis.del(this.buildUsedPromoCodesKey(customerId));
  }
}
