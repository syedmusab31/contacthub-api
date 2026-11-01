const authService = require('./auth.service');
const { contextFrom } = require('../audit/audit.service');
const env = require('../../config/env');
const { ok, created, noContent } = require('../../utils/response');

const COOKIE_NAME = 'refreshToken';
const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

/**
 * The refresh token is set as an httpOnly cookie for browsers and also
 * returned in the body for mobile / server clients.
 */
function sendSession(res, status, { user, accessToken, refreshToken }) {
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
  const payload = {
    user,
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
  return status === 201 ? created(res, payload) : ok(res, payload);
}

const readRefreshToken = (req) => req.body?.refreshToken || req.cookies?.[COOKIE_NAME];

async function register(req, res) {
  sendSession(res, 201, await authService.register(req.body, contextFrom(req)));
}

async function login(req, res) {
  sendSession(res, 200, await authService.login(req.body, contextFrom(req)));
}

async function google(req, res) {
  const session = await authService.loginWithGoogle(req.body, contextFrom(req));
  sendSession(res, session.created ? 201 : 200, session);
}

async function refresh(req, res) {
  sendSession(res, 200, await authService.refresh(readRefreshToken(req), contextFrom(req)));
}

async function logout(req, res) {
  await authService.logout(readRefreshToken(req));
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  noContent(res);
}

async function logoutAll(req, res) {
  await authService.logoutAll(req.user._id);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  noContent(res);
}

async function verifyEmail(req, res) {
  const user = await authService.verifyEmail(req.body.token);
  ok(res, { user, message: 'Email verified' });
}

async function resendVerification(req, res) {
  await authService.resendVerification(req.user);
  ok(res, { message: 'Verification email sent' });
}

async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body.email);
  ok(res, { message: 'If that email is registered, a reset link has been sent' });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body, contextFrom(req));
  ok(res, { message: 'Password updated, please log in again' });
}

module.exports = {
  register,
  login,
  google,
  refresh,
  logout,
  logoutAll,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
