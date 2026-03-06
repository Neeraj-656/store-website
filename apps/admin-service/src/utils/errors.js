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
  constructor(message = 'Insufficient permissions for this action') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(422, message, 'VALIDATION_ERROR');
  }
}

// Wraps a failed downstream service call into a structured error
export class DownstreamError extends AppError {
  constructor(service, statusCode, message) {
    super(statusCode >= 500 ? 502 : statusCode, `[${service}] ${message}`, 'DOWNSTREAM_ERROR');
    this.downstreamService = service;
  }
}
