import { Collection, MongoClient, ObjectId, WithId } from 'mongodb';
import { Tier } from './Tier';

export interface TiersRepository {
  findByProductId(productId: Tier['productId']): Promise<Tier | null>;
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

  async findByProductId(productId: Tier['productId']): Promise<Tier | null> {
    const tier = await this.collection.findOne({
      productId,
    });

    return tier ? toDomain(tier) : null;
  }

  async findByTierId(tierId: Tier['id']): Promise<Tier | null> {
    const tier = await this.collection.findOne({ _id: new ObjectId(tierId) });

    return tier ? toDomain(tier) : null;
  }
}
