# Data model and migration strategy

## Conventions

- **Ids**: PayCo-issued, prefixed, opaque (`ord_`, `pay_`, `mer_`, `key_`, `evt_`, …), 24 base62
  characters of randomness. Stored as `VARCHAR(40)` primary keys. Provider ids are never primary
  keys and never appear in public responses.
- **Money**: `amount_minor BIGINT` + `currency CHAR(3)`. Mapped to the `Money` value object.
  `CHECK (currency = 'USD')` during the PRD's USD-only scope; widening it is a migration plus a
  product decision.
- **Tenancy**: every merchant-owned table has `merchant_id NOT NULL` with a foreign key and an
  index. Aggregate roots expose `UNIQUE (merchant_id, id)` so children can use composite foreign
  keys that make cross-tenant references impossible.
- **Time**: `TIMESTAMPTZ(3)`, UTC.
- **Concurrency**: aggregates carry `version INT`; updates are `WHERE id = ? AND version = ?`.
- **Immutability**: ledger entries and audit records (Phase 2/4) will be protected by
  `BEFORE UPDATE OR DELETE` triggers that raise, in addition to having no update paths in code.

## Phase 1 tables

| Table | Owner | Notes |
|---|---|---|
| `merchants` | merchants | status, `live_charges_enabled` (set when gateway approves KYB) |
| `merchant_provider_accounts` | merchants | one per merchant per mode; internal gateway account id |
| `api_keys` | api-credentials | HMAC hash only (`CHECK` hex-64), revocation/expiry |
| `orders` | orders | money CHECKs, status CHECK, optimistic `version` |
| `provider_resource_mappings` | owning module | `(provider, mode, resource_type, provider_resource_id)` unique |
| `idempotency_records` | platform | `(merchant_id, scope, key)` unique; lease (`locked_until`); outcome JSON; `CHECK` completed ⇔ outcome |
| `outbox_events` | platform | partial index on unpublished rows |

## Phase 2 tables (migration `20261027010000_phase2_core_platform`)

| Table | Owner | Notes |
|---|---|---|
| `users` | identity-access | lower-case email (CHECK), Argon2id hash (CHECK `$argon2id$%`), lockout counters, `version` |
| `refresh_tokens` | identity-access | one row per refresh token; SHA-256 hash only; `family_id` groups a login; rotation is compare-and-set |
| `password_reset_tokens` | identity-access | hash only, 30-min expiry, single use (compare-and-set) |
| `memberships` | team-access | unique (user, merchant); role CHECK |
| `invitations` | team-access | hash only, 7-day expiry; `owner` not invitable (CHECK) |
| `merchants` (+cols) | merchants | branding (hex colour / https logo CHECKs), descriptor, payment methods, fee schedule, `version` |
| `onboarding_applications` | merchant-onboarding | one per merchant; EIN and owner DOB/SSN-last-4 application-encrypted (AES-256-GCM, key id in ciphertext); owners/address/bank token as JSON; status CHECK |
| `onboarding_documents` | merchant-onboarding | S3 key + retention date only, never bytes |
| `audit_records` | audit | append-only: `BEFORE UPDATE OR DELETE` trigger raises |
| `api_request_logs` | api-credentials | metadata only (method, route template, status, duration, request id) |

## Planned (by phase)

- **P3**: `payments`, `payment_attempts`, `provider_events` (raw body hash, signature-verified flag,
  processing status, `UNIQUE(provider, provider_event_id)`).
- **P4**: `refunds`, `ledger_accounts`, `journal_transactions`, `journal_entries` (deferred
  constraint trigger asserting Σdebits = Σcredits per transaction; `UNIQUE(idempotency_key)`),
  `fee_schedules`, `fee_records`, `settlements`, `settlement_report_imports`,
  `reconciliation_runs`, `reconciliation_items`, `webhook_endpoints`, `webhook_events`,
  `webhook_delivery_attempts`.
- **P5**: `payment_links`, `disputes`, `invoices`, `subscriptions`, `payout_recipients`,
  `payout_requests`, `payout_approvals`, `payout_limits`.

## Migration strategy

- Prisma Migrate with SQL migrations committed in `prisma/migrations/` (Prisma requires them beside
  the schema, so `src/infrastructure/persistence/migrations` from the brief is not used).
- Create: `npm run db:migrate:dev -- --name <change>` against a local database, then **review and
  hand-edit the SQL** to add constraints Prisma cannot express (CHECKs, partial indexes, triggers).
  Document each addition in this file.
- Apply: `npm run db:migrate:deploy` as a one-off release task *before* the new application
  version starts. Never run `migrate dev` or `db push` against shared environments.
- **Expand → migrate → contract** for every breaking change: add nullable/new structures, deploy
  code that writes both, backfill in batches, switch reads, then drop the old structure in a later
  release. Financial tables are never rewritten in place.
- Large backfills run as idempotent, resumable jobs, not inside migrations.
- Staging is migrated first from the same artifacts; production migrations require a reviewed
  backup/PITR checkpoint.
