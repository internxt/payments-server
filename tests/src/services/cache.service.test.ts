import config from '../../../src/config';
import { UserType } from '../../../src/core/users/User';
import Logger from '../../../src/Logger';
import CacheService from '../../../src/services/cache.service';
import { getSubscription, getUser, newTier } from '../fixtures';

let cacheService: CacheService;

jest.mock('ioredis', () => require('ioredis-mock'));

describe('Cache Service', () => {
  beforeEach(() => {
    cacheService = new CacheService(config);
  });

  describe('Initializing Cache', () => {
    test('When instantiating the service successfully, then the Redis connection is established', async () => {
      const newCacheService = new CacheService(config);

      await expect(newCacheService.ping()).resolves.not.toThrow();
    });

    test('When an error occurs, then it is logged', async () => {
      const loggerSpy = jest.spyOn(Logger, 'error');
      const newCacheService = new CacheService(config);

      const error = new Error('Connection failed');
      (newCacheService as any).redis.emit('error', error);

      expect(loggerSpy).toHaveBeenCalledWith(`[CACHE SERVICE]: Redis error: ${error.message}`);

      loggerSpy.mockRestore();
    });
  });

  describe('Safe await error handling', () => {
    test('When a Redis operation fails, then the error is logged and null is returned', async () => {
      const loggerSpy = jest.spyOn(Logger, 'error');
      const newCacheService = new CacheService(config);
      const redisError = new Error('Redis operation failed');

      jest.spyOn((newCacheService as any).redis, 'get').mockRejectedValueOnce(redisError);

      const result = await newCacheService.getSubscription('customer-123');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CACHE SERVICE]: There was an error while accessing the cache.'),
      );
      expect(result).toBeNull();

      loggerSpy.mockRestore();
    });
  });

  describe('User subscription', () => {
    const mockedUserWithSubscription = getUser();
    const mockedSubscription = getSubscription({
      type: 'subscription',
    });

    describe('Adding user subscription', () => {
      it('When user subscription is set, then it is stored in Redis', async () => {
        await cacheService.setSubscription(
          mockedUserWithSubscription.customerId,
          UserType.Individual,
          mockedSubscription,
        );

        const storedSubscription = await cacheService.getSubscription(mockedUserWithSubscription.customerId);

        expect(storedSubscription).toStrictEqual(mockedSubscription);
      });
    });

    describe('Fetching user subscription', () => {
      it('When subscription is cached, then the subscription is returned', async () => {
        const storedSubscription = await cacheService.getSubscription(mockedUserWithSubscription.customerId);

        expect(storedSubscription).toStrictEqual(mockedSubscription);
      });

      it('When no subscription is cached, then it returns null', async () => {
        const nonExistingUserInCache = getUser();

        const storedPromoCodes = await cacheService.getSubscription(nonExistingUserInCache.customerId);

        expect(storedPromoCodes).toBeNull();
      });
    });

    describe('Deleting user subscription', () => {
      it('When called, then it removes the user subscription from Redis', async () => {
        await cacheService.clearSubscription(mockedUserWithSubscription.customerId);

        const storedPromoCodes = await cacheService.getSubscription(mockedUserWithSubscription.customerId);

        expect(storedPromoCodes).toBeNull();
      });
    });
  });

  describe('Used coupons for a user', () => {
    const mockedExistingUserForPromoCodes = getUser();
    const mockedPromoCodes = ['PROMO_CODE', 'PROMO_CODE_1'];

    describe('Adding user promo codes to cache', () => {
      it('When promo codes are set, then they are stored in Redis', async () => {
        await cacheService.setUsedUserPromoCodes(mockedExistingUserForPromoCodes.customerId, mockedPromoCodes);

        const storedPromoCodes = await cacheService.getUsedUserPromoCodes(mockedExistingUserForPromoCodes.customerId);

        expect(storedPromoCodes).toStrictEqual(mockedPromoCodes);
      });
    });

    describe('Fetching user promo codes', () => {
      it('When promo codes are cached, then it returns an array of promo code strings', async () => {
        const storedPromoCodes = await cacheService.getUsedUserPromoCodes(mockedExistingUserForPromoCodes.customerId);

        expect(storedPromoCodes).toStrictEqual(mockedPromoCodes);
      });

      it('When no promo codes are cached, then it returns null', async () => {
        const nonExistingUserInCache = getUser();

        const storedPromoCodes = await cacheService.getUsedUserPromoCodes(nonExistingUserInCache.customerId);

        expect(storedPromoCodes).toBeNull();
      });
    });

    describe('Deleting user promo codes from cache', () => {
      it('When called, then it removes the used promo codes key for the given customer from Redis', async () => {
        await cacheService.clearUsedUserPromoCodes(mockedExistingUserForPromoCodes.customerId);

        const storedPromoCodes = await cacheService.getUsedUserPromoCodes(mockedExistingUserForPromoCodes.customerId);

        expect(storedPromoCodes).toBeNull();
      });
    });
  });

  describe('User tier', () => {
    const mockedUser = getUser();
    const mockedTier = newTier();

    test('When the user tier is set, then it is stored in Redis', async () => {
      await cacheService.setUserTier(mockedUser.uuid, mockedTier);

      const storedTier = await cacheService.getUserTier(mockedUser.uuid);

      expect(storedTier).toStrictEqual(mockedTier);
    });

    test('When the user has a cached tier, then it is fetched from redis', async () => {
      const storedTier = await cacheService.getUserTier(mockedUser.uuid);

      expect(storedTier).toStrictEqual(mockedTier);
    });

    test('When no tier is cached, then no tier is returned', async () => {
      const mockedNonExistingUserTier = getUser();

      const storedTier = await cacheService.getUserTier(mockedNonExistingUserTier.uuid);

      expect(storedTier).toBeNull();
    });
  });
});
