import { UserCoupon } from './UserCoupon';

export interface UsersCouponsRepository {
  findById(id: UserCoupon['id']): Promise<UserCoupon | null>;
  findByUserAndCoupon(userId: UserCoupon['user'], couponId: UserCoupon['coupon']): Promise<UserCoupon | null>;
  create(payload: Omit<UserCoupon, 'id'>): Promise<void>;
  findCouponsByUserId(userId: UserCoupon['user']): Promise<UserCoupon[] | null>;
}
