import { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { preloadData } from './preloadMongoDBData';
import start from '../../../src/server';
import CacheService from '../../../src/services/cache.service';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: FastifyInstance;

jest.mock('ioredis', () => require('ioredis-mock'));

export const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  mongoClient = await new MongoClient(uri).connect();
  app = await start(mongoClient);
  await preloadData(mongoClient);
  await CacheService.initialize();

  return app;
};

export const closeServerAndDatabase = async () => {
  try {
    if (app) {
      await app.close();
    }

    if (mongoClient) {
      await mongoClient.close();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Error during server and database shutdown:', error);
  }
};
