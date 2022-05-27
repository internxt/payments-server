import axios from 'axios';
import 'dotenv/config';

import Fastify from 'fastify';
import { MongoClient } from 'mongodb';
import { ConfigService } from './services/ConfigService';
import { StorageService } from './services/StorageService';
import { UsersService } from './services/UsersService';
import webhook from './webhook';

const fastify = Fastify({
  logger: true,
});

const start = async () => {
  const configService = new ConfigService(process.env);

  const storageService = new StorageService(configService, axios);

  const mongoClient = new MongoClient(configService.getEnvironment().MONGO_URI);
  await mongoClient.connect();
  const usersService = new UsersService(mongoClient);

  fastify.register(webhook(storageService, usersService));

  try {
    const PORT = process.env.SERVER_PORT;
    if (!PORT) throw new Error('SERVER_PORT env variable must be defined');

    await fastify.listen(PORT, '0.0.0.0');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
