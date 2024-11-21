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
    { uuid: 'user1', email: 'user1@example.com', name: 'User One' },
    { uuid: 'user2', email: 'user2@example.com', name: 'User Two' },
  ]);

  await db.collection('products').insertMany([
    { id: 'prod1', name: 'Product One', price: 100 },
    { id: 'prod2', name: 'Product Two', price: 200 },
  ]);

  await db.collection('licenses').insertMany([
    { id: 'license1', owner: 'user1', productId: 'prod1' },
    { id: 'license2', owner: 'user2', productId: 'prod2' },
  ]);
};
