import { Collection, MongoClient } from 'mongodb';

enum OS {
  Android = 'android',
  IOS = 'ios'
}
export interface DisplayBilling {
  display: boolean;
  oses: { [key in OS]: string }[]
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

    return displayBilling as DisplayBilling;
  }
}
