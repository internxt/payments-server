import { FastifyRequest, FastifyReply } from 'fastify';

export function requireAuthCallback(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  request
    .jwtVerify()
    .then(() => done())
    .catch((err) => {
      request.log.warn(`JWT verification failed: ${err.message}`);
      reply.status(401).send({ message: 'Unauthorized' });
    });
}
