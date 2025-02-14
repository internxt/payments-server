import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';
import { UserType } from '../../../src/core/users/User';
import { getPrices, getUniqueCodes } from '../fixtures';

export const preloadData = async (client: MongoClient) => {
  const db = client.db('payments');
  const mockedPrices = getPrices();
  const mockedUniqueCodes = getUniqueCodes();

  await db.collection('license_codes').insertMany([
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCodes.techCult.provider,
      code: mockedUniqueCodes.techCult.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCodes.techCult.provider,
      code: mockedUniqueCodes.techCult.codes.nonElegible,
      redeemed: true,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCodes.stackCommerce.provider,
      code: mockedUniqueCodes.stackCommerce.codes.elegible,
      redeemed: false,
    },
    {
      priceId: mockedPrices.lifetime.exists,
      provider: mockedUniqueCodes.stackCommerce.provider,
      code: mockedUniqueCodes.stackCommerce.codes.nonElegible,
      redeemed: true,
    },
  ]);

  await db.collection('users').insertMany([
    { uuid: randomUUID(), customerId: `cus_${randomUUID()}`, lifetime: false },
    { uuid: randomUUID(), customerId: `cus_${randomUUID()}`, lifetime: true },
  ]);

  await db.collection('products').insertMany([
    { userType: UserType.Business, customerId: `prod_QSIkFOC1iCrHAd` },
    { userType: UserType.Business, paymentGatewayId: `prod_QSIpZDVYVLVil1` },
  ]);
};
