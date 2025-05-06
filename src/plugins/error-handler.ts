import { FastifyInstance, FastifyReply } from 'fastify';
import { HttpError } from '../errors/HttpError';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        message: error.message,
      });
    }

    return reply.status(error.statusCode ?? 500).send({
      message: error.message,
    });
  });
}
