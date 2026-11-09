# PayCo backend

Backend for **PayCo**, a white-label USD payments platform for US businesses, built over a
regulated payment processor (proposed: Razorpay US) using the **sub-merchant model**: each client
has its own gateway account and pay-in funds settle from the gateway directly to the client's bank.
PayCo never holds or pools pay-in funds and is **not** the payment processor.

> **Status: Phases 1–2 implemented; Phases 3–5 have tested domain cores and published routes that
> answer `501 not_implemented`.** Not production-ready and not reviewed for regulatory compliance.
> Gateway capabilities that depend on unanswered commercial questions are disabled in live mode —
> see [`docs/open-questions.md`](docs/open-questions.md) and the
> [implementation checklist](docs/implementation-checklist.md).

Source of truth: *PRD: White-Label Payments on Razorpay (USD)*.

## Documentation

| Document | Contents |
|---|---|
| [AGENTS.md](AGENTS.md) · [BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) · [PRD (PDF)](docs/PRD_White_Label_Payments.pdf) | contributor/AI rules, technical baseline, business source of truth |
| [Architecture overview](docs/architecture/overview.md) | constraints from the PRD, context map, payment lifecycle, reliability rules, security, environments |
| [Module ownership](docs/architecture/module-ownership.md) | layer and cross-module rules, who owns what, endpoint audiences |
| [Data model](docs/architecture/data-model.md) | conventions, tables, migration strategy |
| [ADR-0001](docs/adr/0001-nestjs-ddd-hexagonal-modular-monolith.md) · [ADR-0002](docs/adr/0002-sub-merchant-model-and-provider-abstraction.md) · [ADR-0003](docs/adr/0003-idempotency-outbox-and-uncertain-provider-outcomes.md) · [ADR-0004](docs/adr/0004-authentication-and-authorization.md) | architecture decisions |
| [Open questions](docs/open-questions.md) | unresolved PRD / contract questions (detailed; maps to [OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)) |
| [Implementation checklist](docs/implementation-checklist.md) | what is done and what is planned, by phase |

## Stack

Node.js 22 · TypeScript 5.9 (strict) · NestJS 11 · Prisma 6 / PostgreSQL 16 · Redis 7 (ioredis) ·
AWS SQS, Secrets Manager (S3 in Phase 2) · Zod 4 · Pino · Swagger · Jest 29 · ESLint 9 · Docker.

## Layout

```text
src/
├── main.ts, app.module.ts
├── bootstrap/            security, validation, OpenAPI, app wiring
├── config/               Zod-validated environment → typed AppConfig
├── shared/
│   ├── domain/           Entity, AggregateRoot, ValueObject, DomainEvent, errors, Money, pagination, permissions, retry policy
│   ├── application/      ports: UnitOfWork, Clock, IdGenerator, Idempotency, events, secrets, audit, auth, storage, encryption, locks
│   ├── infrastructure/   Prisma transaction host + UoW, outbox writer, idempotency store, logging, request context
│   └── presentation/     error filter, envelope, Zod pipe, API-key / JWT+RBAC guards, decorators, 501 helper
├── modules/
│   ├── identity-access/  ✅ register, login, rotating refresh tokens, password reset, invitations
│   ├── team-access/      ✅ roles/permissions, invitations, members
│   ├── merchants/        ✅ merchant settings, lifecycle, sub-account provisioning, admin
│   ├── merchant-onboarding/ ✅ KYB application, encrypted owner data, documents, gateway submission/decision
│   ├── api-credentials/  ✅ API keys (issue/list/revoke/authenticate), request logs
│   ├── audit/            ✅ append-only audit trail + admin search
│   ├── notifications/    ✅ EmailSender port (logging adapter)
│   ├── orders/           ✅ create/get orders (reference slice)
│   ├── health/           ✅ liveness/readiness
│   ├── payments/ refunds/ payment-links/ ledger/ platform-fees/ settlements/ reconciliation/
│   │   disputes/ webhooks/ customers/ invoices/ subscriptions/ payouts/   🧩 domain cores + 501 routes
│   └── reporting/        ⏳ 501 route
├── integrations/
│   ├── payment-providers/  domain-ports, razorpay/, stripe-connect/, testing/
│   ├── payout-providers/   domain-ports, testing/
│   └── notifications/      email port + adapters
├── infrastructure/       secrets, cache (Redis, rate limit, lock), crypto (AES-GCM), storage (S3), messaging (SQS, outbox), scheduler
├── workers/              outbox-relay (live) + 7 entry points that refuse to start until implemented
└── tests/                unit/, architecture/, integration/, e2e/, support/
prisma/                   schema.prisma, migrations/ (Phase 1, Phase 2), seed.ts
```

✅ implemented and persisted · 🧩 domain/application implemented and unit-tested, routes answer `501`
· ⏳ planned. Details per module: [module ownership](docs/architecture/module-ownership.md).

## Getting started

Prerequisites: Node.js ≥ 22, npm, Docker (for PostgreSQL and Redis).

```bash
cp .env.example .env              # dev-only placeholder values
npm ci                            # also generates the Prisma client
docker compose up -d postgres redis
npm run db:migrate:deploy         # apply migrations
npm run db:seed                   # dev merchant; prints test API key + owner/admin logins once
npm run start:dev                 # http://localhost:3000, docs at /docs
```

Or sign up through the API (creates user, merchant workspace, onboarding draft and a test key):

```bash
curl -s http://localhost:3000/v1/auth/register -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a long passphrase","business_name":"Acme"}'
```

Dashboard calls use `Authorization: Bearer <access_token>`; refresh with
`POST /v1/auth/refresh {"refresh_token": …}` (single use — each refresh returns a new one).

Create an order with the printed key:

```bash
curl -s http://localhost:3000/v1/orders \
  -H "Authorization: Bearer sk_test_…" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "usd", "receipt": "INV-1001"}'
```

The seeded merchant uses the in-memory **fake** provider, so no gateway credentials are required.
To exercise Razorpay test mode, set `SECRET_RAZORPAY_TEST` (JSON with `keyId`, `keySecret`,
`webhookSecret`) and point the merchant's test provider account at `razorpay`.

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | API with watch mode |
| `npm run build` / `npm start` | compile / run compiled API |
| `npm run start:worker:outbox-relay` | outbox → SQS relay (needs `SQS_OUTBOX_QUEUE_URL`) |
| `node dist/workers/<name>/main.js` | other workers (currently refuse to start: not implemented) |
| `npm run typecheck` | `tsc --noEmit` over sources and tests |
| `npm run lint` / `npm run format` | ESLint (incl. layer rules) / Prettier |
| `npm test` | unit + architecture tests |
| `npm run test:e2e` | HTTP pipeline tests with in-memory adapters |
| `npm run test:integration` | PostgreSQL tests; set `INTEGRATION_DATABASE_URL` to a migrated DB (e.g. compose `postgres-test` on port 5433) |
| `npm run validate` | schema validate + typecheck + lint + format check + tests + build |
| `npm run db:migrate:dev -- --name x` | create a migration (then review and hand-edit SQL) |
| `npm run db:migrate:deploy` | apply migrations |
| `docker compose --profile api up --build` | run the API in a container |

## API conventions (v1)

- Base path `/v1`; health endpoints are unversioned (`/health/live`, `/health/ready`).
- Merchant API auth: `Authorization: Bearer sk_{test|live}_…` (server-to-server only).
- Dashboard auth: `Authorization: Bearer <JWT>` + RBAC; `PayCo-Mode: live` header selects live data.
- Admin routes (`/v1/admin/*`): platform administrators only.
- Routes of later phases answer `501 not_implemented` (after auth and validation).
- `Idempotency-Key` header **required** on financial create operations; replays return the original
  outcome for 24 h; payload changes → `422 idempotency_key_reused`.
- Amounts are integer cents; currency `usd`.
- Success: `{ "data": …, "meta": { "request_id": … } }`; lists add `meta.pagination` (cursor).
- Errors: `{ "error": { "code", "message", "details?" }, "meta": { "request_id" } }`; codes are
  stable snake_case (`validation_failed`, `resource_not_found`, `provider_outcome_unknown`, …).
- `X-Request-Id` is accepted (if well-formed) or generated and always echoed.
- `503 provider_outcome_unknown` / `provider_unavailable` include `Retry-After`; retry with the
  same idempotency key.

## Environments and secrets

`NODE_ENV` ∈ development | test | staging | production. Staging/production reject env-file secrets,
the fake provider, missing Redis, non-https CORS origins and (production) the Swagger UI. Secrets
are read through `SecretsProvider`: from `SECRET_*` env vars locally, from AWS Secrets Manager
(`{SECRETS_NAMESPACE}/{name}`) when deployed. Never commit real secrets or production data.
