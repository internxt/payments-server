import { Collection, MongoClient, ObjectId, WithId } from 'mongodb';
import { Tier } from './Tier';

export interface TiersRepository {
  findByProductId(productId: Tier['productId'], billingType?: Tier['billingType']): Promise<Tier | null>;
  findByTierId(tierId: Tier['id']): Promise<Tier | null>;
}

function toDomain(tier: WithId<Omit<Tier, 'id'>>): Tier {
  return {
    ...tier,
    id: tier._id.toString(),
  };
}

export class MongoDBTiersRepository implements TiersRepository {
  private readonly collection: Collection<Tier>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<Tier>('tiers');
  }

  async findByProductId(productId: Tier['productId'], billingType?: Tier['billingType']): Promise<Tier | null> {
    const query: Record<string, unknown> = { productId };

    if (typeof billingType !== 'undefined') {
      query.billingType = billingType;
    }

    const tier = await this.collection.findOne(query);
    return tier ? toDomain(tier) : null;
  }

  async findByTierId(tierId: Tier['id']): Promise<Tier | null> {
    const tier = await this.collection.findOne({ _id: new ObjectId(tierId) });

    return tier ? toDomain(tier) : null;
  }
}
