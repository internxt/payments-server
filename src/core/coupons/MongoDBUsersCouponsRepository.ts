import { Collection, MongoClient, ObjectId, WithId } from 'mongodb';
import { UsersCouponsRepository } from './UsersCouponsRepository';
import { UserCoupon } from './UserCoupon';

interface UserCouponDocument extends WithId<Omit<UserCoupon, 'id' | 'user' | 'coupon'>> {
  user: ObjectId;
  coupon: ObjectId;
}

function toDomain(doc: UserCouponDocument): UserCoupon {
  return {
    id: doc._id.toString(),
    coupon: doc.coupon.toString(),
    user: doc.user.toString(),
  };
}

function toDocument(domain: Omit<UserCoupon, 'id'>): Omit<UserCouponDocument, '_id'> {
  return {
    coupon: new ObjectId(domain.coupon),
    user: new ObjectId(domain.user),
  };
}

export class MongoDBUsersCouponsRepository implements UsersCouponsRepository {
  private readonly collection: Collection<UserCouponDocument>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<UserCouponDocument>('users_coupons');
  }

  async findById(id: UserCoupon['id']): Promise<UserCoupon | null> {
    const userCoupon = await this.collection.findOne({ _id: new ObjectId(id) });

    return userCoupon ? toDomain(userCoupon) : null;
  }

  async findByUserAndCoupon(userId: UserCoupon['user'], couponId: UserCoupon['coupon']): Promise<UserCoupon | null> {
    const userCoupon = await this.collection.findOne({
      user: new ObjectId(userId),
      coupon: new ObjectId(couponId),
    });

    return userCoupon ? toDomain(userCoupon) : null;
  }

  async create(payload: Omit<UserCoupon, 'id'>): Promise<void> {
    console.log('PAYLOAD IN CREATE', payload);
    await this.collection.insertOne(toDocument(payload) as UserCouponDocument);
  }
}
