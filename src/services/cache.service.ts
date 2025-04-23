import { UserSubscription, UserType } from '../core/users/User';
import Redis from 'ioredis';
import { type AppConfig } from '../config';

const SUBSCRIPTION_EXPIRATION_IN_SECONDS = 15 * 60;
const LIFETIME_STACK_TTL = 60 * 60 * 24 * 4;

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

  private buildLifetimeStackKey(invoiceId: string) {
    return `lifetime-stack:${invoiceId}`;
  }

  async setFirstStackValue(invoiceId: string, bytes: number): Promise<number> {
    const ok = await this.redis.set(
      this.buildLifetimeStackKey(invoiceId),
      String(bytes),
      'EX',
      LIFETIME_STACK_TTL,
      'NX',
    );

    if (ok === 'OK') return bytes;
    return Number(await this.redis.get(this.buildLifetimeStackKey(invoiceId)));
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

  async setSubscription(customerId: string, userType: UserType, subscription: UserSubscription): Promise<void> {
    await this.redis.set(
      this.buildSubscriptionKey(customerId, userType),
      JSON.stringify(subscription),
      'EX',
      SUBSCRIPTION_EXPIRATION_IN_SECONDS,
    );
  }

  async clearSubscription(customerId: string, userType: UserType = UserType.Individual): Promise<void> {
    await this.redis.del(this.buildSubscriptionKey(customerId, userType));
  }
}
