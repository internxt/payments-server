import { User } from '../users/User';
import { Coupon } from './Coupon';

export interface UserCoupon {
  id: string;
  user: User['id'];
  coupon: Coupon['id']
}
