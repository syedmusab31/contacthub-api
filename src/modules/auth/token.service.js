const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const RefreshToken = require('./refreshToken.model');
const User = require('../users/user.model');
const { randomToken, sha256, daysFromNow } = require('../../utils/helpers');

const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'contact-manager-api' };

function signAccessToken(user) {
  return jwt.sign({ email: user.email }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    subject: user.id,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_OPTIONS.algorithm],
    issuer: JWT_OPTIONS.issuer,
  });
}

async function issueRefreshToken(userId, meta = {}, family = crypto.randomUUID()) {
  const token = randomToken(48);
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: daysFromNow(env.REFRESH_TOKEN_TTL_DAYS),
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip,
  });
  return token;
}

/** Issue a new access + refresh token pair for a fresh login. */
async function issueTokenPair(user, meta) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await issueRefreshToken(user._id, meta),
  };
}

/**
 * Exchange a refresh token for a new pair. The old token is revoked; if a
 * revoked token is presented again the whole family is revoked.
 */
async function rotateRefreshToken(token, meta) {
  if (!token) throw AppError.unauthorized('Refresh token is required');
  const stored = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!stored) throw AppError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    throw AppError.unauthorized('Refresh token reuse detected, please log in again');
  }
  if (stored.expiresAt < new Date()) throw AppError.unauthorized('Refresh token expired');

  // Atomic claim so two parallel refreshes cannot both succeed.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { revokedAt: new Date() }
  );
  if (!claimed) throw AppError.unauthorized('Refresh token already used');

  const user = await User.findById(stored.user);
  if (!user) throw AppError.unauthorized('User no longer exists');

  return {
    user,
    tokens: {
      accessToken: signAccessToken(user),
      refreshToken: await issueRefreshToken(user._id, meta, stored.family),
    },
  };
}

async function revokeRefreshToken(token) {
  if (!token) return;
  await RefreshToken.updateOne({ tokenHash: sha256(token), revokedAt: null }, { revokedAt: new Date() });
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
