import { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { preloadData } from './preloadMongoDBData';
import config from '../../../src/config';
import { buildApp } from '../../../src/app';
import { buildDependencies, Dependencies } from '../../../src/dependencies';

let mongoServer: MongoMemoryServer;
let dependencies: Dependencies;
let app: FastifyInstance;

const seedDatabase = async (uri: string) => {
  const mongoClient = await new MongoClient(uri).connect();
  try {
    await preloadData(mongoClient);
  } finally {
    await mongoClient.close();
  }
};

export const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;
  dependencies = await buildDependencies(config);
  app = await buildApp(dependencies);
  await app.ready();
  await seedDatabase(uri);

  return app;
};

export const closeServerAndDatabase = async () => {
  try {
    if (app) {
      await app.close();
    }

    if (dependencies) {
      await dependencies.closeConnections();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Error during server and database shutdown:', error);
  }
};
