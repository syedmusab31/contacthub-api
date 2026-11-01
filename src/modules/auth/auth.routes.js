const { Router } = require('express');
const controller = require('./auth.controller');
const schemas = require('./auth.validation');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { authLimiter } = require('../../middleware/rateLimiter');

const router = Router();

router.post('/register', authLimiter, validate(schemas.register), controller.register);
router.post('/login', authLimiter, validate(schemas.login), controller.login);
router.post('/google', authLimiter, validate(schemas.google), controller.google);
router.post('/refresh', validate(schemas.refresh), controller.refresh);
router.post('/logout', controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);

router.post('/verify-email', validate(schemas.verifyEmail), controller.verifyEmail);
router.post('/resend-verification', authLimiter, authenticate, controller.resendVerification);
router.post('/forgot-password', authLimiter, validate(schemas.forgotPassword), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate(schemas.resetPassword), controller.resetPassword);

module.exports = router;
