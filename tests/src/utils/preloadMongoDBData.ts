import { MongoClient } from 'mongodb';
import { UserType } from '../../../src/core/users/User';
import { prices, uniqueCode, user } from '../mocks';

export const preloadData = async (client: MongoClient) => {
  const mockedUser = user();
  const mockedPrices = prices();
  const mockedUniqueCode = uniqueCode();
  const db = client.db('payments');

  await db.collection('license_codes').insertMany([
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCode.techCult.provider,
      code: mockedUniqueCode.techCult.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCode.techCult.provider,
      code: mockedUniqueCode.techCult.codes.nonElegible,
      redeemed: true,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCode.stackCommerce.provider,
      code: mockedUniqueCode.stackCommerce.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCode.stackCommerce.provider,
      code: mockedUniqueCode.stackCommerce.codes.nonElegible,
      redeemed: true,
    },
  ]);

  await db.collection('users').insertMany([
    {
      customer_id: mockedUser.customerId,
      uuid: mockedUser.uuid,
      lifetime: mockedUser.lifetime,
    },
  ]);

  await db.collection('products').insertMany([
    { userType: UserType.Business, customerId: `prod_QSIkFOC1iCrHAd` },
    { userType: UserType.Business, paymentGatewayId: `prod_QSIpZDVYVLVil1` },
  ]);
};
