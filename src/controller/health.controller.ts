import { FastifyInstance } from 'fastify';
import { HealthService } from '../services/health.service';

export default function healthController(healthService: HealthService) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/health', async () => {
      return await healthService.checkHealth();
    });
  };
}
