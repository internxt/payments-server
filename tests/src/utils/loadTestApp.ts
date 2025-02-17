import { default as start } from '../../../src/server';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { preloadData } from './preloadMongoDBData';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let app: any;

export const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  mongoClient = await new MongoClient(uri).connect();
  app = await start(mongoClient);
  await preloadData(mongoClient);

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
