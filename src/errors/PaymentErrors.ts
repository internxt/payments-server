import { BadRequestError, ConflictError, InternalServerError, NotFoundError } from './Errors';

export class NotFoundSubscriptionError extends NotFoundError {
  constructor(message: string) {
    super(message);
  }
}

export class CouponCodeError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidSeatNumberError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

export class IncompatibleSubscriptionTypesError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

export class CustomerNotFoundError extends NotFoundError {
  constructor(email: string) {
    super(`Customer with email ${email} does not exist`);
  }
}

export class MissingParametersError extends BadRequestError {
  constructor(params: string[]) {
    const missingParams = params.join(', ');
    super(`You must provide the following parameters: ${missingParams}`);
  }
}

export class NotFoundPlanByIdError extends NotFoundError {
  constructor(priceId: string) {
    super(`Plan with an id ${priceId} does not exist`);
  }
}

export class NotFoundPromoCodeByNameError extends NotFoundError {
  constructor(promoCodeId: string) {
    super(`Promotion code with an id ${promoCodeId} does not exist`);
  }
}

export class PromoCodeIsNotValidError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

export class ExistingSubscriptionError extends ConflictError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidTaxIdError extends BadRequestError {
  constructor() {
    super('The provided Tax ID is invalid');
  }
}

export class UpdateWorkspaceError extends InternalServerError {
  constructor(message: string) {
    super(message);
  }
}
