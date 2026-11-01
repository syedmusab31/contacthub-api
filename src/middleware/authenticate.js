const AppError = require('../utils/AppError');
const tokenService = require('../modules/auth/token.service');
const User = require('../modules/users/user.model');
const env = require('../config/env');

/**
 * Verify the Bearer access token and attach the user to req.user.
 * Tokens issued before the last password change are rejected.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }

  const payload = tokenService.verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw AppError.unauthorized('User no longer exists');

  // iat has one-second resolution, so compare in whole seconds.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw AppError.unauthorized('Password was changed, please log in again');
  }

  req.user = user;
  next();
}

/** Blocks unverified accounts when REQUIRE_EMAIL_VERIFICATION is on. */
function requireVerifiedEmail(req, res, next) {
  if (env.REQUIRE_EMAIL_VERIFICATION && !req.user.isEmailVerified) {
    throw AppError.forbidden('Please verify your email address first');
  }
  next();
}

module.exports = { authenticate, requireVerifiedEmail };
