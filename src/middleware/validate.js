const AppError = require('../utils/AppError');

/**
 * Validate and coerce req.body / req.query / req.params with zod schemas.
 * Only the parsed result is kept, so unknown fields never reach the services.
 */
const validate = (schemas) => (req, res, next) => {
  const details = [];

  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        details.push({ location: part, path: issue.path.join('.'), message: issue.message });
      }
      continue;
    }
    // req.query is a getter in Express 5, so it has to be redefined instead of assigned.
    Object.defineProperty(req, part, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  if (details.length) return next(AppError.validation(details));
  next();
};

module.exports = validate;
