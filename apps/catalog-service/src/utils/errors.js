/**
 * Base error class for all operational domain errors.
 */
export class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict detected') {
    super(message, 409, 'CONFLICT');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access to this resource is forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class BusinessRuleError extends AppError {
  constructor(message = 'Business rule violation') {
    super(message, 422, 'UNPROCESSABLE_ENTITY');
  }
}