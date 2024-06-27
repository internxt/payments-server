import { Collection, MongoClient } from 'mongodb';

import { Product, ProductsRepository } from './ProductsRepository';
import { UserType } from './User';

export class MongoDBProductsRepository implements ProductsRepository {
  private readonly collection: Collection<Product>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<Product>('products');
  }

  async findByType(type: UserType): Promise<Product[]> {
    const products = await this.collection.find({ userType: type }).toArray();

    return products;
  }
}
