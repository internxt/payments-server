import { FastifyInstance } from 'fastify';

import { loadConfig } from './config';
import { buildApp } from './app';
import { buildDependencies } from './dependencies';

const start = async (): Promise<FastifyInstance> => {
  const config = loadConfig();
  const dependencies = await buildDependencies(config);
  const fastify = await buildApp(dependencies);

  fastify.addHook('onClose', async () => {
    await dependencies.closeConnections();
  });

  try {
    const PORT = Number(config.SERVER_PORT);

    if (!PORT) {
      throw new Error('ENV VARIABLE SERVER_PORT IS NOT DEFINED');
    }

    await fastify.listen({
      port: PORT,
      host: '0.0.0.0',
    });
    return fastify;
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

export default start;
