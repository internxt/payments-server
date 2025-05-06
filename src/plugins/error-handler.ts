import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../errors/HttpError';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    return reply.status(500).send({
      error: 'InternalServerError',
      message: 'Something went wrong',
    });
  });
}
