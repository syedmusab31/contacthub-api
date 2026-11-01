# ContactHub API

Backend for a personal contact manager, built with Node.js, Express 5 and MongoDB.

Besides basic CRUD it handles the parts a real contacts app needs: accounts with
email verification and password reset, refresh-token sessions, groups and tags,
sharing a contact with another user, CSV/vCard import and export, duplicate
detection and merging, a recoverable trash, change history, and birthday
reminder emails.

## Contents

- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [API overview](#api-overview)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Scripts](#scripts)
- [License](#license)

## Tech stack

| Area           | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Runtime        | Node.js 22+                                                   |
| HTTP           | Express 5                                                     |
| Database       | MongoDB with Mongoose 9                                       |
| Validation     | Zod                                                           |
| Auth           | JWT access tokens, rotating refresh tokens, Google ID tokens  |
| Jobs           | BullMQ on Redis (optional), node-cron fallback                |
| Email          | Nodemailer (any SMTP provider)                                |
| File storage   | Local disk or S3-compatible storage                           |
| Logging        | Pino with per-request IDs                                     |
| Metrics / docs | Prometheus (`prom-client`), OpenAPI 3 + Swagger UI            |
| Tests          | Node's built-in test runner, Supertest, mongodb-memory-server |

## Getting started

You need Node.js 22 or newer and a MongoDB instance (local or Atlas). Redis is optional.

```bash
git clone https://github.com/syedmusab31/ContactManager_Backend.git
cd ContactManager_Backend
npm install
cp .env.example .env
```

Open `.env`, set `MONGODB_URI` and `JWT_ACCESS_SECRET`, then start the server:

```bash
npm run dev
```

The API runs on `http://localhost:5000`:

- Interactive docs: `http://localhost:5000/api/docs`
- OpenAPI JSON: `http://localhost:5000/api/docs.json`
- Health checks: `/health` (process is up) and `/ready` (database and Redis reachable)

Quick check with curl:

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"Str0ng!Pass"}'
```

Copy `data.accessToken` from the response and send it as `Authorization: Bearer <token>`
on every other request.

If no SMTP server is configured, emails (verification links, reset links and so on) are
printed to the log, so you can follow every flow locally.

## Configuration

All settings come from environment variables and are checked at startup. If a required
value is missing or invalid, the process exits and tells you which one.
`.env.example` documents every option. The ones you will touch most:

| Variable                     | Default                 | Notes                                                                  |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `MONGODB_URI`                | (required)              | `CONNECTION_STRING` is still accepted for old setups                   |
| `JWT_ACCESS_SECRET`          | (required)              | At least 32 characters                                                 |
| `JWT_ACCESS_EXPIRES_IN`      | `15m`                   | Access token lifetime                                                  |
| `REFRESH_TOKEN_TTL_DAYS`     | `30`                    | Refresh token lifetime                                                 |
| `APP_URL`                    | `http://localhost:3000` | Frontend base URL used in email links                                  |
| `CORS_ORIGINS`               | `http://localhost:3000` | Comma-separated; `*` allows any origin                                 |
| `REQUIRE_EMAIL_VERIFICATION` | `false`                 | When `true`, unverified users cannot log in                            |
| `REDIS_URL`                  | (unset)                 | Turns on BullMQ and shared rate limits                                 |
| `SMTP_HOST` and friends      | (unset)                 | Without them, emails are logged instead of sent                        |
| `GOOGLE_CLIENT_ID`           | (unset)                 | Turns on `POST /auth/google`                                           |
| `STORAGE_DRIVER`             | `local`                 | `local` writes to `UPLOAD_DIR`; `s3` needs `S3_BUCKET` and `S3_REGION` |

## Project layout

Code is grouped by feature. Each module owns its routes, controller, service,
validation schemas and models.

```
src/
├── app.js                 Express app: middleware, routes, error handling
├── server.js              Startup: connect DB → listen → start jobs → graceful shutdown
├── worker.js              Standalone job worker (when using Redis)
├── routes.js              Mounts the modules under /api/v1
├── config/                env validation, logger, MongoDB and Redis connections
├── middleware/            auth, validation, sanitizing, rate limits, uploads, metrics, errors
├── modules/
│   ├── auth/              register, login, Google, refresh tokens, verification, reset
│   ├── users/             profile, password, avatar, account deletion
│   ├── contacts/          CRUD, search, sharing, trash, duplicates, import/export
│   │   └── formats/       CSV and vCard readers/writers
│   ├── groups/            groups and membership
│   ├── audit/             audit log model and service
│   └── health/            /health and /ready
├── jobs/                  queue wrapper, scheduler and job handlers
├── services/
│   ├── mail/              mail transport and templates
│   └── storage/           local and S3 drivers
├── utils/                 AppError, response helpers, validators, small helpers
└── docs/openapi.yaml      API specification
tests/
├── integration/           HTTP-level tests against an in-memory MongoDB
└── unit/                  formats and helpers
```

Controllers only handle HTTP: they read the request, call a service and send the
response. All business rules live in the services, so they can be tested and reused
without Express.

## API overview

Base path: `/api/v1`. Everything except the public auth endpoints needs a Bearer token.
The full request/response reference is in Swagger UI at `/api/docs`.

**Auth**: `/auth`

| Method | Path                   | Purpose                                        |
| ------ | ---------------------- | ---------------------------------------------- |
| POST   | `/register`            | Create an account (sends a verification email) |
| POST   | `/login`               | Email + password login                         |
| POST   | `/google`              | Sign in with a Google ID token                 |
| POST   | `/refresh`             | Swap a refresh token for a new pair            |
| POST   | `/logout`              | Revoke the current refresh token               |
| POST   | `/logout-all`          | Revoke every session                           |
| POST   | `/verify-email`        | Confirm the email address                      |
| POST   | `/resend-verification` | Send a new verification link                   |
| POST   | `/forgot-password`     | Email a reset link                             |
| POST   | `/reset-password`      | Set a new password using the link token        |

**Users**: `/users/me`. `GET`, `PATCH` (name, preferences) and `DELETE` (with password).
Also `PATCH /users/me/password`, and `PUT` / `DELETE /users/me/avatar`.

**Contacts**: `/contacts`

| Method           | Path                      | Purpose                                                            |
| ---------------- | ------------------------- | ------------------------------------------------------------------ |
| GET              | `/`                       | List with `q`, `tag`, `group`, `favorite`, `sort`, `page`, `limit` |
| POST             | `/`                       | Create (response includes possible duplicates)                     |
| GET/PATCH/DELETE | `/:id`                    | Read, partial update, move to trash                                |
| PUT/DELETE       | `/:id/avatar`             | Contact photo                                                      |
| GET              | `/:id/history`            | Field-by-field change history                                      |
| POST             | `/:id/share`              | Share with a user as `viewer` or `editor`                          |
| DELETE           | `/:id/share/:userId`      | Remove access, or leave a contact shared with you                  |
| GET              | `/shared`                 | Contacts others shared with you                                    |
| GET              | `/tags`                   | Tags in use with counts                                            |
| GET              | `/birthdays/upcoming`     | Birthdays in the next `days` days                                  |
| GET              | `/duplicates`             | Clusters of likely duplicates                                      |
| POST             | `/merge`                  | Merge duplicates into one contact                                  |
| GET              | `/export?format=csv\|vcf` | Download contacts                                                  |
| POST             | `/import`                 | Upload a CSV or vCard file (`file` field)                          |
| GET/DELETE       | `/trash`                  | List or empty the trash                                            |
| POST             | `/trash/:id/restore`      | Restore from trash                                                 |
| DELETE           | `/trash/:id`              | Delete for good                                                    |

**Groups**: `/groups`. CRUD, plus `GET/POST/DELETE /groups/:id/contacts` to list,
add or remove members in bulk.

**Audit**: `GET /audit-logs`. Your own activity, filterable by `entityType` and `action`.

### Response format

```json
{ "success": true, "data": { "contact": { "id": "...", "name": "Ada Lovelace" } } }
```

Lists add a `meta` object: `{ "page": 1, "limit": 20, "total": 42, "totalPages": 3 }`.

Errors always look like this:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "location": "body", "path": "emails.0.value", "message": "Invalid email address" }]
  }
}
```

| Status | When                                                                |
| ------ | ------------------------------------------------------------------- |
| 400    | Malformed request, invalid or expired token in a link               |
| 401    | Missing, invalid or expired credentials                             |
| 403    | Authenticated but not allowed (for example a viewer trying to edit) |
| 404    | Not found, or not yours                                             |
| 409    | Duplicate email or group name                                       |
| 413    | Upload too large                                                    |
| 415    | Unsupported upload type                                             |
| 422    | Body, query or path parameters failed validation                    |
| 429    | Rate limit hit                                                      |

## How it works

### Sessions

Login returns a 15-minute JWT access token and a random refresh token. The refresh
token goes in an httpOnly cookie scoped to `/api/v1/auth`, and is also in the response
body for mobile clients. Only a SHA-256 hash of it is stored.

Every refresh revokes the old token and issues a new one in the same "family". If a
revoked token is ever used again, the whole family is revoked, so a stolen token stops
working once either party uses it. Changing or resetting the password revokes all
refresh tokens. Access tokens issued before the change are rejected too.

### Data ownership and sharing

Every contact has an `owner`. All queries are scoped to that owner, so a contact
belonging to someone else returns 404 instead of 403. Sharing adds an entry to
`sharedWith` with a role:

- **viewer**: can read the contact.
- **editor**: can also edit the details, but not the owner's groups or favourite flag.

Only the owner can delete, share or see who else has access.

### Trash and purging

Deleting a contact sets `deletedAt` and moves it to the trash. A daily job permanently
removes anything older than `TRASH_RETENTION_DAYS` (30 by default) and cleans up its
photo. Merged duplicates also go to the trash, so a bad merge can be undone.

### Duplicates

`GET /contacts/duplicates` groups contacts that share an email, a phone number
(compared digits-only, so `+1 (555) 010-2000` matches `+15550102000`) or an
identical name. Groups are transitive: if A matches B and B matches C, all three are
one cluster. Merging combines emails, phones, addresses, tags, groups and shares, fills
in empty fields from the duplicates, and joins the notes.

### Import and export

CSV export uses one row per contact. Multiple emails or phones go in one cell separated
by `|`, optionally with a label (`work: jane@acme.com | home: jane@mail.com`). The
importer also recognises common headers from other tools (`First Name`, `E-mail Address`,
`Mobile`, `Organization`, ...). vCard 3.0 is supported in both directions. Each row is
validated on its own: bad rows are reported with their row number and the rest still
import. By default, rows whose email or phone already exists are skipped.

### Background jobs

Emails and scheduled work go through a small queue wrapper in `src/jobs/queue.js`:

- **With `REDIS_URL`**: jobs run on BullMQ with retries and exponential backoff.
  Scheduled jobs (birthday reminders, trash purge) are registered as BullMQ job
  schedulers, so they run once per schedule even with several API instances. You can
  move job processing out of the API with `npm run worker` and `RUN_WORKER_IN_API=false`.
- **Without Redis**: jobs run in the same process and cron jobs use node-cron. This is
  fine for development or a single instance. With more than one instance and no Redis,
  each instance would run the cron jobs.

### Security measures

- Passwords hashed with bcrypt (cost 12). Login takes about the same time whether or
  not the email exists.
- Helmet security headers, CORS allow-list, request body size limits.
- Rate limiting on all API routes, with a stricter limit on login, register and the
  password and verification endpoints. Limits are stored in Redis when it is available.
- Request input is validated and stripped to known fields before it reaches a service,
  and keys starting with `$` or containing `.` are removed from bodies and queries. This
  blocks NoSQL operator injection and mass assignment (for example sending `owner` or
  `isEmailVerified`).
- Uploads are limited by type and size, stored under random names, and the local driver
  refuses paths outside the upload directory.
- Stack traces are never sent in production, and logs redact tokens, passwords and
  cookies.

### Observability

Every request gets an `X-Request-Id` (or keeps the one it came with), which shows up in
the structured logs. `/metrics` exposes Prometheus metrics, including request duration
by route and status. `/ready` returns 503 when MongoDB or Redis is unreachable, which is
what a load balancer or orchestrator should check.

## Testing

```bash
npm test
```

The suite covers auth flows, permissions between users, sharing roles, import/export
round-trips, duplicate merging, the jobs and the system endpoints. It runs against an
in-memory MongoDB started by `mongodb-memory-server`, so you don't need a database
running. The first run downloads a MongoDB binary. To use one you already have, set
`MONGOMS_SYSTEM_BINARY=/path/to/mongod`.

GitHub Actions runs lint, the format check and the tests on Node 22 and 24 for every
push and pull request (`.github/workflows/ci.yml`).

## Scripts

| Command                 | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Start with auto-reload                         |
| `npm start`             | Start in production mode                       |
| `npm run worker`        | Run the BullMQ worker on its own (needs Redis) |
| `npm test`              | Run the test suite                             |
| `npm run test:coverage` | Tests with a coverage report                   |
| `npm run lint`          | ESLint                                         |
| `npm run format`        | Prettier                                       |

## License

MIT. See [LICENSE](LICENSE).

Built by [Syed Musab Bukhari](https://github.com/syedmusab31).
