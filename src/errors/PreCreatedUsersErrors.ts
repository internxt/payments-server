import { BadRequestError, NotFoundError } from './Errors';

export class PreCreatedUserPendingSetupError extends BadRequestError {
  constructor(message = 'User needs to setup his account') {
    super(message);
    this.cause = 'PRE_CREATED_USER_NEEDS_TO_SETUP_ACCOUNT';
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, PreCreatedUserPendingSetupError.prototype);
  }
}

export class PreCreatedUserNotFoundError extends NotFoundError {
  constructor(message = 'Pre-created user not found') {
    super(message);
    this.cause = 'PRE_CREATED_USER_NOT_FOUND';
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, PreCreatedUserNotFoundError.prototype);
  }
}
