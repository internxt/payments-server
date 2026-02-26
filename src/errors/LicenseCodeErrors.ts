import { NotFoundError } from './Errors';

export class InvalidLicenseCodeError extends NotFoundError {
  constructor() {
    super('Invalid code provided');

    Object.setPrototypeOf(this, InvalidLicenseCodeError.prototype);
  }
}
