const { Router } = require('express');
const controller = require('./group.controller');
const schemas = require('./group.validation');
const validate = require('../../middleware/validate');
const { authenticate, requireVerifiedEmail } = require('../../middleware/authenticate');

const router = Router();

router.use(authenticate, requireVerifiedEmail);

router.route('/').get(controller.list).post(validate(schemas.create), controller.create);

router
  .route('/:id')
  .get(validate(schemas.byId), controller.get)
  .patch(validate(schemas.update), controller.update)
  .delete(validate(schemas.byId), controller.remove);

router
  .route('/:id/contacts')
  .get(validate(schemas.contacts), controller.contacts)
  .post(validate(schemas.members), controller.addContacts)
  .delete(validate(schemas.members), controller.removeContacts);

module.exports = router;
