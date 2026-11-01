const httpStatus = require('./httpStatus');

/**
 * Operational error that is safe to show to API clients.
 * Anything that is not an AppError is treated as a 500.
 */
class AppError extends Error {
  constructor(message, statusCode = httpStatus.INTERNAL_SERVER_ERROR, code, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || httpStatus.codeFor(statusCode);
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new AppError(message, httpStatus.BAD_REQUEST, 'BAD_REQUEST', details);
  }

  static validation(details, message = 'Validation failed') {
    return new AppError(message, httpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, httpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, httpStatus.FORBIDDEN, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, httpStatus.NOT_FOUND, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists') {
    return new AppError(message, httpStatus.CONFLICT, 'CONFLICT');
  }
}

module.exports = AppError;
