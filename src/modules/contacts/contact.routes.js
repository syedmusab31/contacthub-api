const { Router } = require('express');
const controller = require('./contact.controller');
const schemas = require('./contact.validation');
const validate = require('../../middleware/validate');
const { authenticate, requireVerifiedEmail } = require('../../middleware/authenticate');
const { imageUpload, importUpload } = require('../../middleware/upload');
const { idParams, z, pagination } = require('../../utils/validators');

const router = Router();
const historyQuery = { params: idParams, query: z.object(pagination) };

router.use(authenticate, requireVerifiedEmail);

// Collection-level routes must come before "/:id" so they are not treated as ids.
router
  .route('/')
  .get(validate(schemas.list), controller.list)
  .post(validate(schemas.create), controller.create);

router.get('/tags', controller.tags);
router.get('/birthdays/upcoming', validate(schemas.upcomingBirthdays), controller.upcomingBirthdays);
router.get('/duplicates', controller.duplicates);
router.post('/merge', validate(schemas.merge), controller.merge);
router.get('/export', validate(schemas.export), controller.exportContacts);
router.post('/import', importUpload, validate(schemas.import), controller.importContacts);
router.get('/shared', validate(schemas.page), controller.sharedWithMe);

router.route('/trash').get(validate(schemas.page), controller.trash).delete(controller.emptyTrash);
router.post('/trash/:id/restore', validate(schemas.byId), controller.restore);
router.delete('/trash/:id', validate(schemas.byId), controller.destroy);

router
  .route('/:id')
  .get(validate(schemas.byId), controller.get)
  .patch(validate(schemas.update), controller.update)
  .delete(validate(schemas.byId), controller.remove);

router
  .route('/:id/avatar')
  .put(validate(schemas.byId), imageUpload, controller.uploadAvatar)
  .delete(validate(schemas.byId), controller.deleteAvatar);

router.post('/:id/share', validate(schemas.share), controller.share);
router.delete('/:id/share/:userId', validate(schemas.unshare), controller.unshare);
router.get('/:id/history', validate(historyQuery), controller.history);

module.exports = router;
