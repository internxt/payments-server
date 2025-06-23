import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoDBUsersCouponsRepository } from '../../../../src/core/coupons/MongoDBUsersCouponsRepository';
import { getCoupon, getUser } from '../../fixtures';

describe('Testing Users-Coupons collection methods', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: MongoDBUsersCouponsRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    repository = new MongoDBUsersCouponsRepository(client);
  });

  beforeEach(async () => {
    await client.db('payments').collection('users_coupons').deleteMany({});
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  describe('Inserting new relationship between user and coupon', () => {
    it('When a new insertion is requested, the user ID and coupon ID must be recorded', async () => {
      const { id: userId } = getUser();
      const { id: couponId } = getCoupon();

      await repository.create({
        coupon: couponId,
        user: userId,
      });

      const stored = await repository.findByUserAndCoupon(userId, couponId);

      expect(stored).not.toBeNull();
      expect(stored?.user).toBe(userId);
      expect(stored?.coupon).toBe(couponId);
      expect(stored?.id).toBeDefined();
    });
  });

  describe('Fetching relationships', () => {
    describe('Fetching by User Id and Coupon Id', () => {
      it('When searching for a non-existent user and coupon, then it should return null', async () => {
        const { id: userId } = getUser();
        const { id: couponId } = getCoupon();

        const result = await repository.findByUserAndCoupon(userId, couponId);
        expect(result).toBeNull();
      });
    });

    describe('Fetching all coupons associated to one user', () => {
      it('When multiple coupons are created for a user, then all should be returned by findCouponsByUserId', async () => {
        const { id: userId } = getUser();
        const { id: couponId1 } = getCoupon();
        const { id: couponId2 } = getCoupon();

        await repository.create({ user: userId, coupon: couponId1 });
        await repository.create({ user: userId, coupon: couponId2 });

        const coupons = await repository.findCouponsByUserId(userId);
        expect(coupons).toHaveLength(2);
        const ids = coupons?.map((c) => c.coupon);
        expect(ids).toContain(couponId1);
        expect(ids).toContain(couponId2);
      });

      it('When a user has no coupons, then an empty array is returned', async () => {
        const { id: userId } = getUser();

        const result = await repository.findCouponsByUserId(userId);

        expect(result).toEqual([]);
      });
    });
  });
});
