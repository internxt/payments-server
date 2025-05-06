import { HttpError } from './HttpError';

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request Error') {
    super(message, 400);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found Error') {
    super(message, 404);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict Error') {
    super(message, 409);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error') {
    super(message, 500);
  }
}
