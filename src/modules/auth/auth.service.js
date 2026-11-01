const bcrypt = require('bcrypt');
const User = require('../users/user.model');
const tokenService = require('./token.service');
const audit = require('../audit/audit.service');
const queue = require('../../jobs/queue');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { randomToken, sha256 } = require('../../utils/helpers');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// Compared against when the email is unknown, so response time doesn't reveal
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

let googleClient;
function getGoogleClient() {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError('Google sign-in is not configured', 503, 'SERVICE_UNAVAILABLE');
  }
  if (!googleClient) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

async function sendVerificationEmail(user) {
  const token = randomToken();
  user.emailVerificationToken = sha256(token);
  user.emailVerificationExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save();
  await queue.enqueue('send-email', {
    to: user.email,
    template: 'verifyEmail',
    params: { name: user.name, token },
  });
}

async function register({ name, email, password }, context) {
  if (await User.exists({ email })) throw AppError.conflict('An account with this email already exists');

  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();
  await sendVerificationEmail(user);

  await audit.record({
    actor: user._id,
    action: 'user.registered',
    entityType: 'user',
    entityId: user._id,
    context,
  });

  const tokens = await tokenService.issueTokenPair(user, context);
  return { user, ...tokens };
}

async function login({ email, password }, context) {
  const user = await User.findOne({ email }).select('+password');
  const valid = user?.password
    ? await user.comparePassword(password)
    : (await bcrypt.compare(password, DUMMY_HASH)) && false;

  if (!user || !valid) throw AppError.unauthorized('Invalid email or password');
  if (env.REQUIRE_EMAIL_VERIFICATION && !user.isEmailVerified) {
    throw AppError.forbidden('Please verify your email address before logging in');
  }

  await audit.record({
    actor: user._id,
    action: 'user.login',
    entityType: 'user',
    entityId: user._id,
    context,
  });
  const tokens = await tokenService.issueTokenPair(user, context);
  return { user, ...tokens };
}

/** Sign in (or sign up) with a Google ID token obtained by the client. */
async function loginWithGoogle({ idToken }, context) {
  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid Google token');
  }
  if (!payload?.email || !payload.email_verified) {
    throw AppError.unauthorized('Google account email is not verified');
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });
  let created = false;

  if (!user) {
    user = await User.create({
      name: payload.name || email.split('@')[0],
      email,
      googleId: payload.sub,
      isEmailVerified: true,
      avatar: payload.picture ? { url: payload.picture } : undefined,
    });
    created = true;
  } else if (!user.googleId || !user.isEmailVerified) {
    user.googleId = payload.sub;
    user.isEmailVerified = true;
    await user.save();
  }

  await audit.record({
    actor: user._id,
    action: created ? 'user.registered' : 'user.login',
    entityType: 'user',
    entityId: user._id,
    metadata: { provider: 'google' },
    context,
  });

  const tokens = await tokenService.issueTokenPair(user, context);
  return { user, created, ...tokens };
}

async function refresh(refreshToken, context) {
  const { user, tokens } = await tokenService.rotateRefreshToken(refreshToken, context);
  return { user, ...tokens };
}

const logout = (refreshToken) => tokenService.revokeRefreshToken(refreshToken);

const logoutAll = (userId) => tokenService.revokeAllForUser(userId);

async function verifyEmail(token) {
  const user = await User.findOne({
    emailVerificationToken: sha256(token),
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) throw AppError.badRequest('Verification link is invalid or has expired');

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return user;
}

async function resendVerification(user) {
  if (user.isEmailVerified) throw AppError.badRequest('Email is already verified');
  await sendVerificationEmail(user);
}

/** Always succeeds from the caller's view, to avoid leaking which emails exist. */
async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = randomToken();
  user.passwordResetToken = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();
  await queue.enqueue('send-email', {
    to: user.email,
    template: 'resetPassword',
    params: { name: user.name, token },
  });
}

async function resetPassword({ token, password }, context) {
  const user = await User.findOne({
    passwordResetToken: sha256(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw AppError.badRequest('Reset link is invalid or has expired');

  await user.setPassword(password);
  user.passwordChangedAt = new Date();
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // Following the link proves ownership of the inbox.
  user.isEmailVerified = true;
  await user.save();
  await tokenService.revokeAllForUser(user._id);

  await audit.record({
    actor: user._id,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: user._id,
    context,
  });
  await queue.enqueue('send-email', {
    to: user.email,
    template: 'passwordChanged',
    params: { name: user.name },
  });
}

module.exports = {
  register,
  login,
  loginWithGoogle,
  refresh,
  logout,
  logoutAll,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
