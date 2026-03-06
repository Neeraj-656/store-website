export class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code ?? 'APP_ERROR';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(409, message, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(422, message, 'VALIDATION_ERROR');
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(available, requested) {
    super(422, `Insufficient balance. Available: ₹${available / 100}, Requested: ₹${requested / 100}`, 'INSUFFICIENT_BALANCE');
  }
}
