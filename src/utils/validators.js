const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address').max(254));

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

const name = z.string().trim().min(1, 'Name is required').max(100);

const idParams = z.object({ id: objectId });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

module.exports = { z, objectId, email, password, name, idParams, pagination };
