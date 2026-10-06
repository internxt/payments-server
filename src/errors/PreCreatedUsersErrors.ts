import { ConflictError, NotFoundError } from './Errors';

export class PreCreatedUserPendingSetupError extends ConflictError {
  constructor(message = 'User needs to setup his account') {
    super(message);
    this.code = 'AccountSetupPending';
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

export class DriveAccountAlreadyExistsError extends ConflictError {
  constructor(message = 'The email already has an account, log in to continue') {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, DriveAccountAlreadyExistsError.prototype);
  }
}
