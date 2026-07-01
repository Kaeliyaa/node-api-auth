# node-auth-api

A production-grade authentication and data API built with Node.js, Express, and PostgreSQL. Modeled on a real freelance job specification, then extended with production patterns beyond the original scope.

## What This Demonstrates

- Secure auth flow (register, login, logout, password reset) with hashed session tokens
- JWT-based sessions stored as SHA-256 hashes — a database leak alone cannot forge valid sessions
- Transactional email via Resend (production-standard provider, not SMTP)
- Stripe PaymentIntents with signature-verified webhooks — payment status is never client-asserted
- Google OAuth login with automatic account linking
- Database-level business rule enforcement (50-result cap via Postgres trigger, not application code)
- Tiered rate limiting with correct `trust proxy` configuration for reverse-proxy deployments
- Operational vs. unexpected error separation — internal errors never leak to clients
- Fail-fast environment variable validation at startup
- OpenAPI/Swagger docs at `/api-docs`, Postman collection generated from spec
- Automated API tests (Jest + Supertest) against an isolated test database

## Stack

Node.js · Express · PostgreSQL · JWT · Stripe · Resend · Passport.js · Jest

## Prerequisites

- Node.js 18+
- PostgreSQL running locally
- A [Resend](https://resend.com) account (free tier) for transactional email
- A [Stripe](https://dashboard.stripe.com) account in test mode
- A [Google Cloud](https://console.cloud.google.com) project with OAuth credentials

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/node-auth-api.git
cd node-auth-api
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in all values. Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random 64-byte hex string (see below) |
| `JWT_EXPIRES_IN` | Token expiry e.g. `15m` |
| `RESEND_API_KEY` | From resend.com dashboard |
| `EMAIL_FROM` | Verified sender address |
| `STRIPE_SECRET_KEY` | `sk_test_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe CLI (see below) |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Database setup

```bash
psql -U postgres -c "CREATE DATABASE authdb;"
psql -U postgres -d authdb -f migrations/001_schema.sql
psql -U postgres -d authdb -f migrations/002_add_reset_tokens.sql
psql -U postgres -d authdb -f migrations/003_results_constraints.sql
psql -U postgres -d authdb -f migrations/004_add_google_oauth.sql
```

### 4. Start the server

```bash
npm run dev     # development with auto-reload
npm start       # production
```

Verify it's running:
```bash
curl http://localhost:3000/health
```

### 5. Stripe webhooks (local testing)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then in a separate terminal:
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Copy the `whsec_...` value printed and set it as `STRIPE_WEBHOOK_SECRET` in `.env`.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Server health check |
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Log in, returns JWT |
| POST | `/auth/logout` | Yes | Invalidate current session |
| POST | `/auth/reset-password/request` | No | Send reset email |
| POST | `/auth/reset-password/confirm` | No | Complete password reset |
| GET | `/auth/google` | No | Start Google OAuth flow |
| GET | `/auth/google/callback` | No | Google OAuth callback |
| GET | `/sessions` | Yes | List active sessions |
| DELETE | `/sessions/:id` | Yes | Revoke a session |
| GET | `/results/:sessionId` | Yes | List results for a session |
| POST | `/results/:sessionId` | Yes | Add a result (max 50/session) |
| DELETE | `/results/:sessionId/:resultId` | Yes | Delete a result |
| GET | `/purchases` | Yes | List purchases |
| GET | `/purchases/:id` | Yes | Get a purchase |
| POST | `/purchases/checkout` | Yes | Create Stripe PaymentIntent |
| POST | `/webhooks/stripe` | Stripe-signed | Handle payment events |

Full interactive docs: `http://localhost:3000/api-docs`

Full request/response examples: `postman_collection.json`

## Running Tests

Create the test database first:
```bash
psql -U postgres -c "CREATE DATABASE authdb_test;"
psql -U postgres -d authdb_test -f migrations/001_schema.sql
psql -U postgres -d authdb_test -f migrations/002_add_reset_tokens.sql
psql -U postgres -d authdb_test -f migrations/003_results_constraints.sql
psql -U postgres -d authdb_test -f migrations/004_add_google_oauth.sql
```

Then:
```bash
npm test
```

Tests run against an isolated `authdb_test` database. External services (Resend, Stripe) are mocked — no real emails or payments are triggered during test runs.

## Design Decisions

**Session tokens are hashed at rest.** The raw JWT is never stored in the database — only its SHA-256 hash. This means a database breach alone cannot be used to forge valid sessions; an attacker would also need the `JWT_SECRET`.

**Payment status is never client-asserted.** `purchases.status` only changes via a Stripe webhook with a verified signature. A client cannot mark their own purchase as paid.

**The 50-results-per-session cap is enforced by a Postgres trigger**, not application-level counting. This prevents a race condition where two concurrent requests could both pass a stale count check and insert beyond the limit.

**Google OAuth uses account linking.** If a user registers with an email/password and later signs in with Google using the same email, the accounts are merged rather than duplicated. This is the correct production behavior; most OAuth implementations get this wrong.

**OAuth callback returns JSON for API testing purposes.** A production deployment with a frontend would set the token as an `httpOnly` cookie on the redirect response rather than returning it in a JSON body, to avoid token exposure in browser history or server logs.

## Known Limitations

- Rate limiting uses in-memory storage. A multi-instance deployment should use `rate-limit-redis` with a shared Redis store so limits are enforced consistently across instances.
- No CI/CD pipeline configured.
- No automated test coverage for Stripe webhook handling (requires a running Stripe CLI listener; mocking the signature verification is non-trivial).