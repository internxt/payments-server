import { FastifyInstance } from 'fastify';

import envVariablesConfig from './config';
import { buildApp } from './app';
import { buildDependencies } from './dependencies';

const start = async (): Promise<FastifyInstance> => {
  const dependencies = await buildDependencies(envVariablesConfig);
  const fastify = await buildApp(dependencies);

  fastify.addHook('onClose', async () => {
    await dependencies.closeConnections();
  });

  try {
    const PORT = Number(envVariablesConfig.SERVER_PORT);

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
