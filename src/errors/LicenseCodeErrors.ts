export class InvalidLicenseCodeError extends Error {
  constructor() {
    super('Invalid code provided');

    Object.setPrototypeOf(this, InvalidLicenseCodeError.prototype);
  }
}
