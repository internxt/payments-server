import { Collection, MongoClient } from 'mongodb';

interface DisplayBilling {
  display: boolean;
}

export interface DisplayBillingRepository {
  find(): Promise<DisplayBilling>;
}

export class MongoDBDisplayBillingRepository implements DisplayBillingRepository {
  private readonly collection: Collection<DisplayBilling>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<DisplayBilling>('display_billing');
  }

  async find(): Promise<DisplayBilling> {
    const displayBilling = await this.collection.findOne();

    if (!displayBilling) {
      return { display: true };
    }

    return displayBilling;
  }
}
