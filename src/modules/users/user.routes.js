const { Router } = require('express');
const controller = require('./user.controller');
const schemas = require('./user.validation');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { imageUpload } = require('../../middleware/upload');

const router = Router();

router.use(authenticate);

router
  .route('/me')
  .get(controller.getMe)
  .patch(validate(schemas.updateMe), controller.updateMe)
  .delete(validate(schemas.deleteMe), controller.deleteMe);

router.patch('/me/password', validate(schemas.changePassword), controller.changePassword);
router.put('/me/avatar', imageUpload, controller.uploadAvatar);
router.delete('/me/avatar', controller.deleteAvatar);

module.exports = router;
