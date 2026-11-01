const { z, objectId, email, pagination, idParams } = require('../../utils/validators');

const label = z.string().trim().min(1).max(30).optional();
const optionalText = (max) => z.string().trim().max(max).optional();
const url = z.string().trim().max(500).pipe(z.url('Invalid URL'));

const emailEntry = z.object({ label, value: email });
const phoneEntry = z.object({
  label,
  value: z
    .string()
    .trim()
    .min(3, 'Phone number is too short')
    .max(30)
    .regex(/^[+\d][\d\s().-]*$/, 'Invalid phone number'),
});
const addressEntry = z.object({
  label,
  street: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
});
const socialEntry = z.object({ platform: z.string().trim().min(1).max(30), url });

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(150),
  company: optionalText(150),
  jobTitle: optionalText(150),
  emails: z.array(emailEntry).max(10),
  phones: z.array(phoneEntry).max(10),
  addresses: z.array(addressEntry).max(5),
  socialLinks: z.array(socialEntry).max(10),
  website: url.or(z.literal('')),
  birthday: z.coerce
    .date()
    .refine((d) => d <= new Date(), 'Birthday cannot be in the future')
    .nullable(),
  notes: z.string().max(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  groups: z.array(objectId).max(50),
  isFavorite: z.boolean(),
};

/**
 * The first version of this API took a single `email` and `phone` string.
 * Those are still accepted and folded into the arrays.
 */
const legacy = {
  email: email.optional(),
  phone: phoneEntry.shape.value.optional(),
};

function foldLegacy({ email: e, phone, ...rest }) {
  if (e) rest.emails = [{ value: e }, ...(rest.emails || []).filter((x) => x.value !== e)];
  if (phone) rest.phones = [{ value: phone }, ...(rest.phones || []).filter((x) => x.value !== phone)];
  return rest;
}

const optionalFields = Object.fromEntries(
  Object.entries(fields)
    .filter(([key]) => key !== 'name')
    .map(([key, schema]) => [key, schema.optional()])
);

const createBody = z.object({ name: fields.name, ...optionalFields, ...legacy }).transform(foldLegacy);

const updateBody = z
  .object({ name: fields.name.optional(), ...optionalFields, ...legacy })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to update')
  .transform(foldLegacy);

const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

const listQuery = z.object({
  ...pagination,
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  group: objectId.optional(),
  favorite: booleanQuery.optional(),
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'birthday'])
    .default('name'),
});

module.exports = {
  createBody,
  importRow: createBody,
  create: { body: createBody },
  update: { params: idParams, body: updateBody },
  byId: { params: idParams },
  list: { query: listQuery },
  page: { query: z.object(pagination) },
  upcomingBirthdays: { query: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }) },
  share: {
    params: idParams,
    body: z.object({ email, role: z.enum(['viewer', 'editor']).default('viewer') }),
  },
  unshare: { params: z.object({ id: objectId, userId: objectId }) },
  merge: {
    body: z.object({
      primaryId: objectId,
      duplicateIds: z.array(objectId).min(1).max(20),
    }),
  },
  export: {
    query: z.object({
      format: z.enum(['csv', 'vcf']).default('csv'),
      tag: z.string().trim().toLowerCase().max(40).optional(),
      group: objectId.optional(),
      favorite: booleanQuery.optional(),
    }),
  },
  import: {
    query: z.object({
      format: z.enum(['csv', 'vcf']).optional(),
      skipDuplicates: booleanQuery.default(true),
    }),
  },
};
