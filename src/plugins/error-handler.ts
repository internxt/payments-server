import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../errors/HttpError';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        message: error.message,
      });
    }

    const statusCode = error instanceof HttpError ? error.statusCode : (error.statusCode ?? 500);
    const errorMessage = error.message || 'Unknown error';

    request.log.error(
      {
        method: request.method,
        url: request.url,
        statusCode,
        errorMessage,
        stack: error.stack,
        query: request.query,
        body: request.body,
        params: request.params,
      },
      'Unhandled error',
    );

    return reply.status(500).send({
      message: 'Internal server error',
    });
  });
}
