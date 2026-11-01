const { z, password, name } = require('../../utils/validators');

module.exports = {
  updateMe: {
    body: z
      .object({
        name: name.optional(),
        preferences: z
          .object({
            birthdayReminders: z.boolean().optional(),
            timezone: z.string().trim().max(64).optional(),
          })
          .optional(),
      })
      .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
  },
  changePassword: {
    body: z.object({
      currentPassword: z.string().optional(),
      newPassword: password,
    }),
  },
  deleteMe: {
    body: z.object({
      password: z.string().optional(),
      confirm: z.literal('DELETE').optional(),
    }),
  },
};
