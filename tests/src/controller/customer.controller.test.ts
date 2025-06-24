import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getCoupon, getPromoCode, getUser, getValidAuthToken } from '../fixtures';
import { UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import CacheService from '../../../src/services/cache.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Customer controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Fetching user redeemed codes', () => {
    it('When the user has redeemed coupons stored in the database, then their associated promo codes are returned', async () => {
      const mockedUser = getUser();
      const mockedToken = getValidAuthToken(mockedUser.uuid);
      const mockedCoupon = getCoupon();
      const mockedCoupon2 = getCoupon({ code: 'COuPoN' });
      const mockedPromoCode = getPromoCode({
        code: 'PROMO_CODE',
        coupon: {
          id: mockedCoupon.code,
        },
      });
      const mockedPromoCode2 = getPromoCode({
        code: 'PROMO_CODE_2',
        coupon: {
          id: mockedCoupon2.code,
        },
      });
      const mockedCoupons = [mockedCoupon.id, mockedCoupon2.id];

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(CacheService.prototype, 'getUsedUserPromoCodes').mockResolvedValue(null);
      jest.spyOn(UsersService.prototype, 'getStoredCouponsByUserId').mockResolvedValue(mockedCoupons);
      jest.spyOn(PaymentService.prototype, 'getPromoCode').mockImplementation(async (id: string) => {
        if (id === mockedCoupon.id) return mockedPromoCode;
        if (id === mockedCoupon2.id) return mockedPromoCode2;
        throw new Error('Promo code not found');
      });
      jest.spyOn(CacheService.prototype, 'setUsedUserPromoCodes');

      const response = await app.inject({
        method: 'GET',
        path: '/customer/redeemed-promotion-codes',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({ usedCoupons: [mockedPromoCode.code, mockedPromoCode2.code] });
    });

    it("When the user's redeemed promo codes are cached, then the cached promo codes are returned without querying the database", async () => {
      const mockedUser = getUser();
      const mockedToken = getValidAuthToken(mockedUser.uuid);
      const mockedCoupon = getCoupon();
      const mockedCoupon2 = getCoupon({ code: 'COuPoN' });
      const mockedPromoCode = getPromoCode({
        code: 'PROMO_CODE',
        coupon: {
          id: mockedCoupon.code,
        },
      });
      const mockedPromoCode2 = getPromoCode({
        code: 'PROMO_CODE_2',
        coupon: {
          id: mockedCoupon2.code,
        },
      });
      const usedCoupons = [mockedPromoCode.code, mockedPromoCode2.code];

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(CacheService.prototype, 'getUsedUserPromoCodes').mockResolvedValue(usedCoupons);
      const getStoredCouponsFromUserSpy = jest.spyOn(UsersService.prototype, 'getStoredCouponsByUserId');

      const response = await app.inject({
        method: 'GET',
        path: '/customer/redeemed-promotion-codes',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({ usedCoupons });
      expect(getStoredCouponsFromUserSpy).not.toHaveBeenCalled();
    });

    it('When the user has no coupons, then an empty array is returned', async () => {
      const mockedUser = getUser();
      const mockedToken = getValidAuthToken(mockedUser.uuid);

      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(CacheService.prototype, 'getUsedUserPromoCodes').mockResolvedValue(null);
      jest.spyOn(UsersService.prototype, 'getStoredCouponsByUserId').mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        path: '/customer/redeemed-promotion-codes',
        headers: {
          authorization: `Bearer ${mockedToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({ usedCoupons: [] });
    });
  });
});
