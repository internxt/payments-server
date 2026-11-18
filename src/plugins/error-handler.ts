import { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../errors/HttpError';
import { isAxiosError } from 'axios';
import Stripe from 'stripe';
import Logger from '../Logger';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        message: error.message,
        ...(error.code && { code: error.code }),
      });
    }

    const statusCode = error.statusCode ?? 500;
    let errorMessage = error.message || 'Unknown error';

    if (isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    }

    Logger.error(
      {
        method: request.method,
        url: request.url,
        statusCode,
        errorMessage,
        stack: error.stack,
        query: request.query,
        params: request.params,
        ...(error instanceof Stripe.errors.StripeError && { stripeRequestId: error.requestId }),
      },
      'Unhandled error',
    );

    return reply.status(statusCode ?? 500).send({
      message: statusCode > 499 ? 'Internal Server Error' : error.message,
    });
  });
}
