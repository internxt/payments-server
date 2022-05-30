import { FastifyInstance } from 'fastify';
import { type AppConfig } from './config';
import { UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';
import fastifyJwt from '@fastify/jwt';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        fastify.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
      }
    });
  };
}
