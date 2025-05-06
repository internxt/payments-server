import { FastifyInstance, FastifyReply } from 'fastify';
import { HttpError } from '../errors/HttpError';
import { InternalServerError } from '../errors/Errors';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    return reply.status(500).send({
      error: InternalServerError.name,
      message: 'Something went wrong',
    });
  });
}
