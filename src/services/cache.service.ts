import { UserSubscription, UserType } from '../core/users/User';
import Redis from 'ioredis';
import config from '../config';
import { Tier } from '../core/users/Tier';
import Logger from '../Logger';

const FIFTEEN_MINS_EXPIRATION_IN_SECONDS = 15 * 60;
const FOUR_HOURS_EXPIRATION_IN_SECONDS = 4 * 60 * 60;

export default class CacheService {
  private readonly redis: Redis;

  private constructor(redis: Redis) {
    this.redis = redis;
  }

  static create(): CacheService | undefined {
    try {
      const redis =
        config.NODE_ENV === 'production'
          ? new Redis({ host: config.REDIS_HOST, password: config.REDIS_PASSWORD, lazyConnect: true })
          : new Redis({ host: config.REDIS_HOST, lazyConnect: true });

      redis.on('error', (err) => {
        Logger.error(`[CACHE_SERVICE]: Redis error: ${err.message}`);
      });

      return new CacheService(redis);
    } catch (err) {
      Logger.error(`[CACHE_SERVICE]: Failed to initialize Redis: ${(err as Error).message}`);
      return;
    }
  }

  async quit(): Promise<void> {
    await this.redis.quit();
  }

  private buildSubscriptionKey(customerId: string, userType: UserType = UserType.Individual): string {
    return `subscription-${customerId}-${userType}`;
  }

  private buildUsedPromoCodesKey(customerId: string): string {
    return `used-promotion-codes-${customerId}`;
  }

  private buildUserTierKey(userUuid: string): string {
    return `user-tier-${userUuid}`;
  }

  async getSubscription(
    customerId: string,
    userType: UserType = UserType.Individual,
  ): Promise<UserSubscription | null> {
    const cachedSubscription = await this.redis.get(this.buildSubscriptionKey(customerId, userType));

    if (!cachedSubscription) {
      return null;
    }

    return JSON.parse(cachedSubscription);
  }

  async getUsedUserPromoCodes(customerId: string): Promise<string[] | null> {
    const cachedUsedPromoCodesByUser = await this.redis.get(this.buildUsedPromoCodesKey(customerId));

    if (!cachedUsedPromoCodesByUser) {
      return null;
    }

    return JSON.parse(cachedUsedPromoCodesByUser) as string[];
  }

  async getUserTier(userUuid: string): Promise<Tier | null> {
    const cachedUserTier = await this.redis.get(this.buildUserTierKey(userUuid));

    if (!cachedUserTier) {
      return null;
    }

    return JSON.parse(cachedUserTier) as Tier;
  }

  async setSubscription(customerId: string, userType: UserType, subscription: UserSubscription): Promise<void> {
    await this.redis.set(
      this.buildSubscriptionKey(customerId, userType),
      JSON.stringify(subscription),
      'EX',
      FIFTEEN_MINS_EXPIRATION_IN_SECONDS,
    );
  }

  async setUsedUserPromoCodes(customerId: string, promoCodes: string[]): Promise<void> {
    await this.redis.set(
      this.buildUsedPromoCodesKey(customerId),
      JSON.stringify(promoCodes),
      'EX',
      FOUR_HOURS_EXPIRATION_IN_SECONDS,
    );
  }

  async setUserTier(userUuid: string, tier: Tier): Promise<void> {
    await this.redis.set(
      this.buildUserTierKey(userUuid),
      JSON.stringify(tier),
      'EX',
      FIFTEEN_MINS_EXPIRATION_IN_SECONDS,
    );
  }

  async clearSubscription(customerId: string, userType: UserType = UserType.Individual): Promise<void> {
    await this.redis.del(this.buildSubscriptionKey(customerId, userType));
  }

  async clearUsedUserPromoCodes(customerId: string): Promise<void> {
    await this.redis.del(this.buildUsedPromoCodesKey(customerId));
  }

  async clearUserTier(userUuid: string): Promise<void> {
    await this.redis.del(this.buildUserTierKey(userUuid));
  }
}
