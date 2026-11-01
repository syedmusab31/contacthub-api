const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../config/logger');

/** Turn known library errors into AppErrors so clients get a sensible status. */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return AppError.validation(details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for "${err.path}"`);
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return AppError.conflict(`A record with this ${field} already exists`);
  }
  if (err instanceof jwt.TokenExpiredError) return AppError.unauthorized('Access token expired');
  if (err instanceof jwt.JsonWebTokenError) return AppError.unauthorized('Invalid access token');
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return new AppError(err.message, status);
  }
  if (err?.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON body');
  if (err?.type === 'entity.too.large') return new AppError('Request body too large', 413);

  return null;
}

// Express identifies error middleware by its four arguments.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = normalize(err);
  const error = known || new AppError('Something went wrong', 500, 'INTERNAL_ERROR');

  if (error.statusCode >= 500) {
    (req.log || logger).error({ err }, 'Unhandled error');
  }

  const body = {
    success: false,
    error: { code: error.code, message: error.message },
  };
  if (error.details) body.error.details = error.details;
  if (!env.isProduction && !known) body.error.stack = err.stack;

  res.status(error.statusCode).json(body);
}

function notFound(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

module.exports = { errorHandler, notFound };
