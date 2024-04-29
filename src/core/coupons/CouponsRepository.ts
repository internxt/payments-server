import { Coupon } from './Coupon';

export interface CouponsRepository {
  findById(id: Coupon['id']): Promise<Coupon | null>;
  findByCode(code: Coupon['code']): Promise<Coupon | null>;
}
