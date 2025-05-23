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

export class UnauthorizedError extends HttpError {
  constructor(message = 'User Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class GoneError extends HttpError {
  constructor(message = 'Gone') {
    super(message, 410);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error') {
    super(message, 500);
  }
}
