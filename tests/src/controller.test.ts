import start from '../../src/server';

import { FastifyInstance } from 'fastify';
import getMocks from './mocks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { preloadData } from './utils/preloadData';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: FastifyInstance;

const initializeServerAndDatabase = async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;
  mongoClient = await new MongoClient(uri).connect();
  await preloadData(mongoClient);
  app = await start(false, mongoClient);
};

const closeServerAndDatabase = async () => {
  if (app) {
    await app.close();
  }
  if (mongoClient) {
    await mongoClient.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

describe('controller e2e tests', () => {
  beforeAll(() => {
    return initializeServerAndDatabase();
  });

  afterAll(() => {
    return closeServerAndDatabase();
  });

  describe('Check if the unique code provided by the user is valid', () => {
    describe('Determine if the code is invalid', () => {
      it('When the code is already used, it should return 404', async () => {
        const { uniqueCode } = getMocks();
        const response = await app.inject({
          path: '/is-unique-code-available',
          query: { code: uniqueCode.techCult.codes.nonElegible, provider: uniqueCode.techCult.provider },
          method: 'GET',
        });
        expect(response.statusCode).toBe(404);
      });

      // eslint-disable-next-line quotes
      it("When the code doesn't exist, it should return 404", async () => {
        const { uniqueCode } = getMocks();

        const response = await app.inject({
          path: '/is-unique-code-available',
          query: { code: uniqueCode.techCult.codes.doesntExist, provider: uniqueCode.techCult.provider },
          method: 'GET',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    // describe('Determine if the code is valid', () => {
    //   it('When the code is valid, it should return 200', async () => {
    //     const { uniqueCode } = getMocks();

    //     const response = await app.inject({
    //       path: '/is-unique-code-available',
    //       query: { code: uniqueCode.stackCommerce.codes.elegible, provider: uniqueCode.stackCommerce.provider },
    //       method: 'GET',
    //     });
    //     expect(response.statusCode).toBe(200);
    //   });
    // });

    // describe('Determine if a user is eligible for preventing cancellation', () => {
    //   it('When an invalid token is provided, it should return Unauthorized (401)', async () => {
    //     const response = await app.inject({
    //       path: '/request-prevent-cancellation',
    //       method: 'GET',
    //       headers: { authorization: 'Bearer faketoken' },
    //     });

    //     expect(response.statusCode).toBe(401);
    //   });

    //   it('When the user has not free trials nor lifetimes, it should be eligible', async () => {
    //     const { getValidToken, preventCancellationTestUsers: users } = getMocks();
    //     const response = await app.inject({
    //       path: '/request-prevent-cancellation',
    //       method: 'GET',
    //       headers: { authorization: `Bearer ${getValidToken(users.elegible.subscriptionUserUuid)}` },
    //     });

    //     expect(response.statusCode).toBe(200);
    //     expect(JSON.parse(response.body)).toMatchObject({ elegible: true });
    //   });

    //   describe('The users with free trials already applied/lifetime should not be elegible', () => {
    //     it('When the user has a lifetime plan, it should not be elegible', async () => {
    //       const { getValidToken, preventCancellationTestUsers: users } = getMocks();
    //       const response = await app.inject({
    //         path: '/request-prevent-cancellation',
    //         method: 'GET',
    //         headers: { authorization: `Bearer ${getValidToken(users.nonElegible.lifetimeUserUuid)}` },
    //       });

    //       expect(response.statusCode).toBe(200);
    //       expect(JSON.parse(response.body)).toMatchObject({ elegible: false });
    //     });

    //     it('When the user has a subscription and already had a trial, it should not be elegible', async () => {
    //       const { getValidToken, preventCancellationTestUsers: users } = getMocks();
    //       const response = await app.inject({
    //         path: '/request-prevent-cancellation',
    //         method: 'GET',
    //         headers: { authorization: `Bearer ${getValidToken(users.nonElegible.subscriptionUserUuid)}` },
    //       });

    //       expect(response.statusCode).toBe(200);
    //       expect(JSON.parse(response.body)).toMatchObject({ elegible: false });
    //     });
    //   });
    // });

    //   describe('Preventing cancellation when the user is elegible', () => {
    //     describe('Users with active subscription and who have not used the offer', () => {
    //       it('When the user is elegible it should prevent cancellation', async () => {
    //         const { getValidToken, preventCancellationTestUsers: users } = getMocks();

    //         const response = await app.inject({
    //           path: '/prevent-cancellation',
    //           method: 'PUT',
    //           headers: { authorization: `Bearer ${getValidToken(users.elegible.subscriptionUserUuid)}` },
    //         });

    //         expect(response.statusCode).toBe(200);
    //       });
    //     });
    //     describe('Users with active subscription who have used the offer or has a lifetime plan', () => {
    //       it('When the user is not elegible it should not prevent cancellation', async () => {
    //         const { getValidToken, preventCancellationTestUsers: users } = getMocks();
    //         const response = await app.inject({
    //           path: '/prevent-cancellation',
    //           method: 'PUT',
    //           headers: { authorization: `Bearer ${getValidToken(users.nonElegible.subscriptionUserUuid)}` },
    //         });

    //         expect(response.statusCode).toBe(403);
    //       });

    //       it('When the user has a lifetime plan', async () => {
    //         const { getValidToken, preventCancellationTestUsers: users } = getMocks();
    //         const response = await app.inject({
    //           path: '/prevent-cancellation',
    //           method: 'PUT',
    //           headers: { authorization: `Bearer ${getValidToken(users.elegible.subscriptionUserUuid)}` },
    //         });

    //         expect(response.statusCode).toBe(403);
    //       });
    //     });
    //   });

    describe('Fetching plan object by ID and contains the basic params', () => {
      describe('Fetch subscription plan object', () => {
        it('When the planId is valid', async () => {
          const { testPlansId } = getMocks();
          const expectedKeys = {
            selectedPlan: {
              id: expect.anything(),
              currency: expect.anything(),
              amount: expect.anything(),
              bytes: expect.anything(),
              interval: expect.anything(),
              decimalAmount: expect.anything(),
            },
            upsellPlan: {
              id: expect.anything(),
              currency: expect.anything(),
              amount: expect.anything(),
              bytes: expect.anything(),
              interval: expect.anything(),
              decimalAmount: expect.anything(),
            },
          };

          const response = await app.inject({
            path: `/plan-by-id?planId=${testPlansId.subscription.exists}`,
            method: 'GET',
          });
          const responseBody = JSON.parse(response.body);

          expect(response.statusCode).toBe(200);
          expect(responseBody).toMatchObject(expectedKeys);
        });

        it('When the planId is not valid', async () => {
          const { testPlansId } = getMocks();

          const response = await app.inject({
            path: `/plan-by-id?planId=${testPlansId.subscription.doesNotExist}`,
            method: 'GET',
          });

          expect(response.statusCode).toBe(404);
        });
      });

      describe('Fetch Lifetime plan object', () => {
        it('When the planId is valid', async () => {
          const { testPlansId } = getMocks();

          const expectedKeys = {
            selectedPlan: {
              id: expect.anything(),
              currency: expect.anything(),
              amount: expect.anything(),
              bytes: expect.anything(),
              interval: expect.anything(),
              decimalAmount: expect.anything(),
            },
          };

          const response = await app.inject({
            path: `/plan-by-id?planId=${testPlansId.lifetime.exists}`,
            method: 'GET',
          });

          const responseBody = JSON.parse(response.body);

          expect(response.statusCode).toBe(200);
          expect(responseBody).toMatchObject(expectedKeys);
        });

        it('When the planId is not valid', async () => {
          const { testPlansId } = getMocks();

          const response = await app.inject({
            path: `/plan-by-id?planId=${testPlansId.lifetime.doesNotExist}`,
            method: 'GET',
          });

          expect(response.statusCode).toBe(404);
        });
      });
    });
  });
});
