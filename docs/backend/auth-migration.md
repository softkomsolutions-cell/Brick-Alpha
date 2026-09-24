# Phase 2: Users and Authentication

Scope: users, user settings, bearer sessions, password resets, and auth audit events.
The default remains `AUTH_PERSISTENCE_MODE=legacy`. Financial and business data
remain in JSON in every auth mode. No actual user snapshot has been selected or
imported, and the application has not been deployed by this phase.

## Contracts and boundaries

Routes call `services/auth-service.js`; they never call Prisma. Implementations
live in `repositories/legacyAuthRepository.js`, `postgresAuthRepository.js`, and
`dualAuthRepository.js`. The Prisma client is lazy and uses the PostgreSQL adapter
required by [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

Registration, login, and demo retain `{ ok, token, user, settings }`; `/api/auth/me`
retains `{ ok, user, settings }`. Existing validation errors and HTTP statuses
remain compatible. `/api/settings` uses the selected auth repository. The added
`POST /api/auth/logout` revokes the current bearer session and returns `{ ok: true }`.
No frontend changes are required. Infrastructure failures return a generic 503
`auth_unavailable`, never driver messages or connection strings.

## Passwords and identity

PBKDF2-SHA512 remains unchanged: 120,000 iterations, 64-byte output, hexadecimal
hash, and the existing salt string. Imports copy hashes and salts without
rehashing or resetting passwords. Comparisons use `crypto.timingSafeEqual` after
length/format validation. No passwords are logged or returned.

UUID legacy IDs are preserved as PostgreSQL IDs. Other legacy IDs are kept in
`User.legacyId`, with a new internal UUID. Public responses and token subjects
continue to use the legacy ID. JSON business state remains keyed by that ID;
auth cutover never changes trade, portfolio, connector, or other business IDs.

## Persistence modes

| Mode | Reads | Writes and sessions |
|---|---|---|
| `legacy` (default) | JSON | JSON users/settings and new top-level `auth` state |
| `dual` | JSON users/settings compared with PostgreSQL | Both stores; sessions/reset eligibility must pass both |
| `postgres` | PostgreSQL auth records | PostgreSQL auth records only; business routes still use JSON |

Unknown mode values fail startup. Database modes require an explicit PostgreSQL
`DATABASE_URL`; there is no automatic fallback or opportunistic user import.
Dual mode requires an already reconciled users/settings snapshot. Missing or
divergent records fail closed. It is a controlled rehearsal mode, not a
distributed transaction guarantee: PostgreSQL and a filesystem cannot commit
atomically. A crash after the PostgreSQL commit but before the JSON write requires
manual reconciliation before retrying or changing modes. Transaction callbacks
are not automatically replayed. JSON auth mutations are serialized in one process;
the existing JSON store is not safe for concurrent application replicas.

## Sessions and revocation

The frontend still sends `Authorization: Bearer <token>`. Tokens retain the HMAC
envelope and add a random session identifier. `Session.tokenHash` stores only a
SHA-256 digest of the token, associated with the user, seven-day expiry, and
optional revocation timestamp. Every authenticated request checks session state.
PostgreSQL transactions protect registration, login, password reset, and audit writes.

Legacy tokens issued before session records existed remain accepted in legacy
mode until their signed expiry. They are rejected in dual/postgres mode, requiring
one fresh login on cutover. New tokens always require a session record. Logout of
a pre-session token revokes that user's pre-session cohort. Password reset revokes
all recorded sessions and pre-session eligibility. Expired, malformed, extra-segment,
revoked, and wrong-user tokens are rejected.

## Secret and reset policy

Staging/production (including detected Railway environments) require an explicit
`AUTH_SECRET` of at least 32 random characters. Known placeholder/development
values are rejected; startup fails before opening the application listener.
Development can retain the legacy local secret for compatibility. Keep the same
real secret through a planned cutover; replacing it invalidates bearer tokens and
outstanding reset hashes. `CONNECTOR_SECRET` should remain independently configured.

Reset codes use `crypto.randomInt`, expire after 15 minutes, and are stored only as
a user-bound HMAC-SHA256 digest. Database reset consumption is a conditional update
on user, hash, unused state, and future expiry in the same transaction as the
password change and session revocations. A new request supersedes earlier codes.

The request response retains `ok`, `message`, `demoCode`, and `expiresAt`. In
staging/production, `demoCode` and `expiresAt` are always null, regardless of account
existence or compatibility flags. Controlled test environments may expose the code;
local development must explicitly enable `AUTH_RESET_DEMO_CODES=true`.
There is no email provider in this phase, so deployed self-service password reset
cannot yet deliver a code. Do not use response disclosure as a substitute.
Pre-Phase-2 reset codes are not imported; request a fresh code through a future
delivery channel. Existing passwords remain valid.

## Rate limits and CORS

Each limit uses a 15-minute window, independently by client IP and normalized-email
digest when an email is supplied. Responses use 429 `rate_limited` and `Retry-After`.

| Endpoint | Attempts per window |
|---|---:|
| Login | 20 |
| Registration | 10 |
| Reset request | 5 |
| Reset confirmation | 10 |
| Demo creation | 10 |

Counters are bounded to 10,000 keys and fail closed at capacity. They are in-process:
restart resets them and replicas do not share them. Before production scaling,
add shared enforcement or an independently configured edge limit. Forwarding headers
are ignored unless exact trusted proxy IPs/CIDRs are configured in
`TRUSTED_PROXY_CIDRS`. Verify Railway's actual proxy topology before deployment;
otherwise users behind its proxy share an IP budget. Never broadly trust arbitrary
forwarded headers.

`CORS_ALLOWED_ORIGINS` is an exact comma-separated list of frontend origins. Use
the final Cloudflare HTTPS origin; no temporary domain is hardcoded. Deployed
environments deny cross-origin browser access when the list is empty. Development
also allows HTTP localhost, 127.0.0.1, and IPv6 loopback origins. Requests without an
Origin header remain possible; CORS is not an authentication mechanism.

## Controlled user migration

The repository's JSON file is not assumed to be the deployed runtime store. Obtain
and positively identify a staging runtime snapshot separately. Store it outside
Git. No real snapshot was imported during implementation.

From `server/`, with staging-only credentials securely injected into the process:

```text
npm run db:auth:migrate -- --file <explicit-snapshot> --dry-run --environment staging --confirm-staging-service <service-id>
npm run db:auth:migrate -- --file <same-snapshot> --apply --environment staging --confirm-staging-service <service-id> --confirm-source-sha256 <reviewed-sha256>
```

`RAILWAY_SERVICE_ID` must match the confirmed service. Never relabel production
credentials as staging; verify project, environment, service, and connection source
before injecting them. Production contexts are rejected. The CLI requires an
explicit file and exactly one mode; it has no default source. Apply verifies the
source checksum and rechecks destination state inside a serializable transaction.

The report contains only source SHA-256 and counts: users, duplicate normalized
emails, invalid records, existing destination users, inserts, conflicts, skipped
records, and applied records. No emails, hashes, salts, tokens, paths, or raw records
are printed. Invalid records, duplicate IDs/emails, mismatched identities, changed
passwords/settings, or other conflicts block the whole apply. Identical records
are skipped on rerun. Unexpected database errors roll back and are redacted.

Only explicitly selected user identity fields, password hashes/salts, and user
settings are imported. Effective settings and valid timestamps/roles must be
present; the tool does not invent missing values. Sessions and reset tokens are
not imported; database mode requires fresh login/reset. Trades, portfolios,
holdings, valuations, feedback, alerts, watchlists, connectors, imports, and all
financial data are ignored. Successful imports create auth audit events.

## Rollback and remaining rollout gates

Keep the immutable source snapshot and its checksum. Leave the legacy store and
initial migration intact. Never drop PostgreSQL tables to roll back an auth mode.
While default legacy mode is active, rollback is a code rollback with the same
secrets. Before switching from postgres/dual back to legacy, stop auth mutations
and reconcile any new users, settings, and changed password hashes first. Do not
reactivate stale JSON passwords after a PostgreSQL reset. Revoke sessions and
require fresh login when changing authority. There is deliberately no automatic
reverse migration or destructive reconciliation tool.

Auth audits record registration, login success/failure, reset request/completion,
and session revocation with action, user association, and time only. PostgreSQL
uses `AuditEvent`; legacy JSON retains the latest 1,000 auth events. Plan retention
and expired session/reset cleanup before broad deployment.

Outstanding rollout work: identify the real staging snapshot, reconcile roles and
settings (including legacy owner promotion behavior), configure delivery for
password resets, configure final CORS/proxy trust, review multi-instance rate
limiting and JSON limitations, and obtain separate deployment/cutover instructions.

## Validation

Contract tests were added and passed before persistence was changed. Local tests
cover the old APIs, legacy passwords, sessions/revocation, reset policy and reuse,
rate limiting, explicit modes, dual drift, repository behavior, user migration
dry-run/idempotency/conflicts, user isolation, startup secrets, and CORS.

Final validation on 2026-09-16:

| Check | Result |
|---|---|
| `npm run check:full` | PASS |
| Backend tests, including Phase 0/1.5 regressions | 54 passed; no failures or skips |
| Frontend lint | PASS; four existing hook warnings, zero errors |
| Backend syntax and frontend build | PASS |
| Prisma validate and generate | PASS (7.10.0) |
| Local smoke `/`, `/api/health`, `/api/signals`, `/api/news` | PASS; HTTP 200 and expected content |
| Health without `DATABASE_URL` | `not_configured` |
| Staging PostgreSQL auth integration | PASS; synthetic writes rolled back |
| Original migration, frontend, and scoring/valuation source | Unchanged |
| Credential and scratch-file review | No real credentials or temporary artifacts in Git |

Local smoke checks use isolated temporary JSON data with provider refresh disabled;
they do not claim live market/news provider availability. The staging integration
is a database/service test, not an application deployment.

`npm run db:auth:validate-staging` is a guarded integration runner for the existing
staging `Postgres` service. It checks the canonical initial-migration checksum,
exercises synthetic auth operations and user import inside a serializable
transaction, deliberately rolls everything back, and verifies no synthetic users
remain. It never imports an actual snapshot or queries financial domain tables.
No new Prisma migration is required; the applied initial migration is unchanged.

Staging integration passed on 2026-09-16 against `patient-perfection` / `staging` /
`Postgres`. The initial checksum matched the committed migration. Sessions,
revocation, password/reset compatibility, expiry/reuse prevention, settings,
isolation, audit events, synthetic import idempotency, and dual mode passed using
the real PostgreSQL repository. All synthetic changes rolled back; no test users
remained. No real user snapshot was imported and no application was deployed.

Access used a temporary Railway TCP proxy. Its TLS connection verified the
database-specific CA retrieved through authenticated Railway SSH. The temporary
proxy and public CA file were removed afterward. Credentials were held only in
process memory, never printed or written to a file; no rotation was performed.
The application TLS defaults were not weakened. For a future external validation,
repeat the scoped access/CA procedure explicitly; do not disable TLS verification
or reuse a private-network hostname from a local machine. See Railway's
[TCP proxy documentation](https://docs.railway.com/networking/tcp-proxy) and
[certificate initialization source](https://github.com/railwayapp-templates/postgres-ssl/blob/main/init-ssl.sh).
