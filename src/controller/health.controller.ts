import { FastifyInstance } from 'fastify';
import { type Dependencies } from '../dependencies';

export default function healthController({ healthService }: Pick<Dependencies, 'healthService'>) {
  return async function (fastify: FastifyInstance) {
    fastify.get(
      '/health',
      {
        config: {
          rateLimit: {
            max: 80,
            timeWindow: '1 minute',
          },
        },
      },
      async () => {
        return await healthService.checkHealth();
      },
    );
  };
}
