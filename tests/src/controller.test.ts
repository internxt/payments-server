import { default as start } from '../../src/server';

import { FastifyInstance } from 'fastify';
import getMocks from './mocks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { preloadData } from './utils/preloadData';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: FastifyInstance;

const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments', port: 3000 },
  });
  const uri = mongoServer.getUri();
  mongoClient = await new MongoClient(uri).connect();
  app = await start(mongoClient);
  await preloadData(mongoClient);
};

const closeServerAndDatabase = () => {
  try {
    if (app) {
      app.close(async () => {
        await mongoClient.close();
        await mongoServer.stop();
      });
    }
  } catch (error) {
    console.error('Error during server and database shutdown:', error);
  }
};

describe('controller e2e tests', () => {
  beforeAll(async () => {
    return initializeServerAndDatabase();
  });

  afterAll((cb) => {
    closeServerAndDatabase();
    cb();
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
