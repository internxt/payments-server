import { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    request.log.warn(`JWT verification failed: ${(err as Error).message}`);
    reply.status(401).send({ message: 'Unauthorized' });
  }
}
