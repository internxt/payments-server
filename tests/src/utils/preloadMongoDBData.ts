import { MongoClient } from 'mongodb';
import getMocks from '../mocks';

export const preloadData = async (client: MongoClient) => {
  const mocks = getMocks();
  const db = client.db('payments');

  await db.collection('license_codes').insertMany([
    {
      priceId: mocks.prices.lifetime.exists,
      provider: mocks.uniqueCode.techCult.provider,
      code: mocks.uniqueCode.techCult.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mocks.prices.lifetime.exists,
      provider: mocks.uniqueCode.techCult.provider,
      code: mocks.uniqueCode.techCult.codes.nonElegible,
      redeemed: true,
    },
    {
      priceId: mocks.prices.lifetime.exists,
      provider: mocks.uniqueCode.stackCommerce.provider,
      code: mocks.uniqueCode.stackCommerce.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mocks.prices.lifetime.exists,
      provider: mocks.uniqueCode.stackCommerce.provider,
      code: mocks.uniqueCode.stackCommerce.codes.nonElegible,
      redeemed: true,
    },
  ]);

  await db.collection('users').insertMany([
    {
      customer_id: mocks.user.customerId,
      uuid: mocks.user.uuid,
      lifetime: mocks.user.lifetime,
    },
  ]);

  await db.collection('products').insertMany([
    { userType: UserType.Business, customerId: `prod_QSIkFOC1iCrHAd` },
    { userType: UserType.Business, paymentGatewayId: `prod_QSIpZDVYVLVil1` },
  ]);
};
