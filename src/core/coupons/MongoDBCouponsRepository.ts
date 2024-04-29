import { Collection, MongoClient, ObjectId, WithId } from 'mongodb';
import { CouponsRepository } from './CouponsRepository';
import { Coupon } from './Coupon';

interface CouponDocument extends WithId<
  Omit<Coupon, 'id' | 'user' | 'coupon' >
> {
  user: ObjectId;
  coupon: ObjectId;
};

function toDomain(doc: CouponDocument): Coupon {
  return {
    id: doc._id.toString(),
    code: doc.code,
  };
}

export class MongoDBCouponsRepository implements CouponsRepository {
  private readonly collection: Collection<CouponDocument>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<CouponDocument>('coupons');
  }

  async findById(id: Coupon['id']): Promise<Coupon | null> {
    const coupon = await this.collection.findOne({ _id: new ObjectId(id) });

    return coupon ? toDomain(coupon) : null;
  }

  async findByCode(code: Coupon['code']): Promise<Coupon | null> {
    const coupon = await this.collection.findOne({ code });

    return coupon ? toDomain(coupon) : null;
  }
}
