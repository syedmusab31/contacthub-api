const { Router } = require('express');
const auditService = require('./audit.service');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { z, pagination } = require('../../utils/validators');
const { ok } = require('../../utils/response');

const router = Router();

const listSchema = {
  query: z.object({
    ...pagination,
    entityType: z.enum(['user', 'contact', 'group']).optional(),
    action: z.string().trim().max(50).optional(),
  }),
};

/** The signed-in user's own activity, newest first. */
router.get('/', authenticate, validate(listSchema), async (req, res) => {
  const { page, limit, entityType, action } = req.query;
  const filter = { actor: req.user._id };
  if (entityType) filter.entityType = entityType;
  if (action) filter.action = action;
  const { items, meta } = await auditService.list(filter, { page, limit });
  ok(res, items, meta);
});

module.exports = router;
