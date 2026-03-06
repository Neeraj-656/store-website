export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.isOperational = true; // 🚀 FIX 2: Safe to return to client
    
    // 🚀 FIX 1: Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BusinessRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusinessRuleError';
    this.statusCode = 400;
    this.isOperational = true; 
    
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class VersionConflictError extends Error {
  constructor(message = 'Optimistic locking version conflict') {
    super(message);
    this.name = 'VersionConflictError';
    this.statusCode = 409;
    this.isOperational = true; 
    
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}