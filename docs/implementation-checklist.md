# Phased implementation checklist

Legend: `[x]` done and verified by tests in this repository · `[~]` partial · `[ ]` planned.
"Core" = domain model + application logic implemented and unit-tested, but not yet persisted or
exposed (its routes answer `501 not_implemented`).

## Phase 1 — Architecture and scaffolding ✅

- [x] PRD review; bounded contexts, ownership, open questions; ADR-0001…0003
- [x] NestJS 11 / TypeScript strict / ESLint 9 (type-aware + layer rules) / Prettier / Jest projects
- [x] Zod environment validation with per-environment guard rails; Pino logging with redaction and request ids
- [x] Swagger at `/docs` from Zod schemas; Helmet, HSTS, strict CORS, body limits, Redis-backed rate limiting
- [x] Response/error envelopes, URI versioning, shared kernel (`Money`, aggregates, events, errors)
- [x] Unit of work, transactional outbox + relay worker (SQS), PostgreSQL idempotency store
- [x] Provider-neutral payment port + capability matrix; Razorpay, Stripe Connect (skeleton), fake adapters
- [x] Orders vertical slice (`POST /v1/orders`, `GET /v1/orders/:id`)
- [x] Docker, docker-compose, CI workflow, seed script

## Phase 2 — Core platform ✅ (code complete; DB-backed integration tests run in CI only)

- [x] Identity & Access: register (user + merchant + owner + onboarding draft + test key), login with lockout (5 → 15 min), Argon2id, HS256 JWT access tokens (15 min) bound to a session family, opaque rotating refresh tokens with reuse detection, logout, forgot/reset password (single-use, revokes all sessions), invitation acceptance, `GET /v1/auth/me`
- [x] Team Access: roles → permissions (maker/checker split for payouts), invitations (emailed token, hashed at rest), role changes with last-owner protection, RBAC guard
- [x] Merchant Management: Merchant aggregate (status lifecycle, branding, statement descriptor, payment methods), sandbox and live sub-account provisioning via provider port, live enablement on approval; admin list / status / fee-schedule assignment
- [x] Merchant Onboarding: application aggregate with computed requirements, owners (25%+ / controller), AES-256-GCM field encryption for EIN, DOB, SSN last 4, gateway terms acceptance, two-step submission to the gateway (retryable), gateway decision recording, S3 pre-signed document uploads with retention date; admin list/decision/retry
- [x] API Credentials: issue (reveal once) / list / revoke; live keys only after approval; API request logs (metadata only)
- [x] Audit: append-only `audit_records` (DB trigger), written in the caller's transaction, admin search
- [x] Notifications: EmailSender port + logging adapter
- [x] Migration `20261027010000_phase2_core_platform` with CHECK constraints and trigger
- [ ] Email vendor adapter (open question Q14) — until then emails are logged, not delivered
- [ ] PostgreSQL row-level security on merchant-owned tables (optional hardening)
- [ ] MFA enrolment (model is MFA-ready: `mfa_enabled`, session families)
- [ ] Breached-password screening; email verification flow

## Phase 3 — Pay-in foundation (core ✅, persistence/endpoints ☐)

- [x] Core: Payment aggregate (forward-only, duplicate/stale detection), ApplyProviderPaymentEventUseCase (marks order paid once), Orders `OrderPaymentRecorder`
- [x] Core: inbound ProviderEvent + IngestProviderWebhookUseCase (raw-body verification, dedupe, outbox)
- [x] Routes published (501): `GET /v1/payments`, `GET /v1/payments/:id`, `POST /v1/payments/:id/verify`, `POST /webhooks/providers/:provider/:mode`
- [x] Workers: shared SQS consumer (backoff + jitter, DLQ via redrive); `provider-webhook-processing`, `payment-status-sync` entry points (refuse to start until implemented)
- [ ] Prisma: `payments`, `provider_events` tables + repositories; wire use cases; checkout session endpoint
- [ ] Worker handlers; DLQ replay tooling with audit; Razorpay sandbox integration tests

## Phase 4 — Financial operations (core ✅, persistence/endpoints ☐)

- [x] Core: Refund aggregate + policy (in-flight refunds counted), CreateRefundUseCase (never resends after unknown outcome)
- [x] Core: Ledger — chart of accounts (merchant + platform books, no pooled PayCo balance), balanced immutable journal transactions, posting rules (capture, refund, settlement, chargeback, ACH return, platform fee split/invoice), reversals, balances, idempotent LedgerService
- [x] Core: versioned FeeSchedule with PRD §9 rates; margin calculation verified against the PRD table
- [x] Core: Settlement aggregate (net = gross − fees, idempotent re-import); reconciliation matcher
- [x] Core: outbound webhooks — public event catalogue, `PayCo-Signature` (timestamp + rotation), endpoint (SSRF guard, 24 h secret overlap), delivery retries for 24 h then exhausted / replay
- [x] Routes published (501): refunds, settlements, reconciliation records, webhook endpoints CRUD, deliveries, replay, admin fee-schedule create; `GET /v1/admin/pricing/fee-schedules` is live
- [x] Workers: `webhook-delivery`, `settlement-import`, `reconciliation` entry points
- [ ] Prisma tables (refunds, ledger with deferred balance trigger, fee schedules/records, settlements, reconciliation runs, webhook endpoints/deliveries) + wiring + worker handlers

## Phase 5 — Remaining PRD features (core ✅ where listed)

- [x] Core: PaymentLink (expiry, usage limits); Dispute (evidence deadline with forwarding margin); Invoice (integer totals, exact payment); Subscription (month-end clamping, dunning 1/3/5 days); Customer
- [x] Core: Payouts — Recipient (verification + OFAC screening gate), Payout state machine (maker-checker, partner statuses), limits, partner FBO balance check; payout-provider port + fake
- [x] Routes published (501): payment links, recipients, payouts, approvals, reports summary
- [x] Workers: `notification-delivery`, `billing-scheduler` entry points; IntervalScheduler + Redis lock
- [ ] Persistence and endpoints for all of the above; payouts partner adapter (blocked on Q5); email templates/receipts; reporting read models

## Cross-cutting backlog

- [ ] Run integration tests against PostgreSQL (CI does; not possible in the authoring environment)
- [ ] Initialise git and open the first pull request
- [ ] Infrastructure as code: SQS queues + DLQs, S3 (KMS, lifecycle), Secrets Manager, RDS (PITR), ElastiCache
- [ ] OpenTelemetry traces/metrics; load and chaos tests (idempotency, webhook storms)
- [ ] Dependency upgrades (Prisma 7, ESLint 10, Jest 30, NestJS 12), each separately
