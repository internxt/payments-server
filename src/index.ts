import axios from 'axios';
import 'dotenv/config';

import Fastify from 'fastify';
import { MongoClient } from 'mongodb';
import config from './config';
import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import webhook from './webhooks';

const fastify = Fastify({
  logger: true,
});

const start = async () => {
  const storageService = new StorageService(config, axios);

  const mongoClient = new MongoClient(config.MONGO_URI);
  await mongoClient.connect();
  const usersService = new UsersService(mongoClient);

  fastify.register(webhook(storageService, usersService, config));

  try {
    const PORT = config.SERVER_PORT;

    await fastify.listen(PORT, '0.0.0.0');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
