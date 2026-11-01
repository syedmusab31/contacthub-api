const { z, email, password, name } = require('../../utils/validators');

const token = z.string().trim().min(10, 'Invalid token');

module.exports = {
  register: { body: z.object({ name, email, password }) },
  login: { body: z.object({ email, password: z.string().min(1, 'Password is required') }) },
  google: { body: z.object({ idToken: z.string().min(10) }) },
  refresh: { body: z.object({ refreshToken: z.string().optional() }) },
  verifyEmail: { body: z.object({ token }) },
  forgotPassword: { body: z.object({ email }) },
  resetPassword: { body: z.object({ token, password }) },
};
