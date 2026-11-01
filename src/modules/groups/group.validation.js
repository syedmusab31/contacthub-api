const { z, objectId, idParams, pagination } = require('../../utils/validators');

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().trim().max(300).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #2563eb')
    .optional(),
};

module.exports = {
  create: { body: z.object(fields) },
  update: {
    params: idParams,
    body: z
      .object({ ...fields, name: fields.name.optional() })
      .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to update'),
  },
  byId: { params: idParams },
  contacts: { params: idParams, query: z.object(pagination) },
  members: {
    params: idParams,
    body: z.object({ contactIds: z.array(objectId).min(1).max(500) }),
  },
};
