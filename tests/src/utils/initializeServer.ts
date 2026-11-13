import { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { preloadData } from './preloadMongoDBData';
import config from '../../../src/config';
import { buildApp } from '../../../src/app';
import { buildDependencies, Dependencies } from '../../../src/dependencies';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let dependencies: Dependencies;
let app: FastifyInstance;

/**
 * Builds the app with the real dependencies over an in-memory Mongo, without opening a port: tests call it through
 * `app.inject`.
 */
export const initializeServerAndDatabase = async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'payments' },
  });
  const uri = mongoServer.getUri();
  mongoClient = await new MongoClient(uri).connect();
  dependencies = await buildDependencies({ config, mongoClient });
  app = await buildApp(dependencies);
  await app.ready();
  await preloadData(mongoClient);

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
