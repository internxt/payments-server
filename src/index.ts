import 'dotenv/config';

import Fastify from 'fastify';
const fastify = Fastify({
  logger: true,
});

fastify.get('/', async (request, reply) => {
  return { hello: 'world' };
});

const start = async () => {
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
