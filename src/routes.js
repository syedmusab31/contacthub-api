const { Router } = require('express');

const router = Router();

router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/users', require('./modules/users/user.routes'));
router.use('/contacts', require('./modules/contacts/contact.routes'));
router.use('/groups', require('./modules/groups/group.routes'));
router.use('/audit-logs', require('./modules/audit/audit.routes'));

module.exports = router;
