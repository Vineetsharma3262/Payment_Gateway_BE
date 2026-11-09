# PayCo backend — architecture overview

Source of truth: **PRD: White-Label Payments on Razorpay (USD)**. This document explains how the
backend realises that PRD. Where the PRD leaves something open, it is listed in
[`../open-questions.md`](../open-questions.md) rather than decided here.

## 1. What PayCo is (and is not)

PayCo is a **white-label layer** over a regulated payment processor (proposed: Razorpay US). PayCo
owns every surface a client or customer touches — API, SDKs, checkout, links, dashboard, webhooks,
ledger, pricing — while the gateway performs card/ACH processing, KYB/KYC decisions, PCI-scoped card
handling and settlement (PRD §1, §4).

Non-negotiable constraints carried into the code:

| Constraint (PRD) | How the architecture enforces it |
|---|---|
| Sub-merchant model; PayCo never holds pay-in funds (§3) | No pooled balance, wallet or master-merchant account exists in the schema. Each merchant has its own provider account (`merchant_provider_accounts`). Ledger (Phase 4) records *expected* settlements to the merchant's bank, never PayCo cash. |
| PayCo never claims to be the processor (§4, §8) | OpenAPI description names the processing partner as processor; no code path presents PayCo as acquirer. |
| Gateway is swappable without client changes (§1, §7) | Provider-neutral `PaymentProvider` port + capability matrix; PayCo-issued ids only; provider ids kept in `provider_resource_mappings`. |
| PayCo ids, cents, `usd`, idempotency keys on creates (§7.2) | `ord_…` ids from `RandomIdGenerator`; `Money` value object in integer cents; USD-only check at the application boundary and in a DB CHECK; `Idempotency-Key` required. |
| Card data never touches PayCo servers (§8, SAQ A) | No endpoint accepts card data; log redaction is defence in depth. |
| Webhooks re-signed with PayCo keys, retried 24h (§7.3) | Separate inbound and outbound webhook flows (Phase 3/4); retry schedule in `shared/application/retry-policy.ts`. |

## 2. Style: modular monolith, DDD, hexagonal

See [ADR-0001](../adr/0001-nestjs-ddd-hexagonal-modular-monolith.md). One deployable codebase,
several processes (API + workers), one PostgreSQL database with **per-module table ownership**.

```
            ┌──────────────── presentation (NestJS controllers, guards, Zod DTOs) ───────────────┐
            │                                                                                    │
            ▼                                                                                    │
      application  (use cases, ports: repositories, providers, UoW, outbox, idempotency)          │
            │                                                                                    │
            ▼                                                                                    │
        domain  (aggregates, value objects, events, invariants — no framework imports)           │
            ▲                                                                                    │
            │ implements ports                                                                   │
      infrastructure (Prisma repositories, SQS, Redis, Secrets Manager) / integrations (gateways) ┘
```

Dependency direction is enforced twice: ESLint `no-restricted-imports` per layer and the executable
architecture tests in `src/tests/architecture`.

## 3. Bounded-context map

```
                            ┌────────────────────┐
                            │ Identity & Access  │  users, sessions, MFA-ready
                            └─────────┬──────────┘
                                      │ authenticates
┌──────────────────┐   approves  ┌────▼───────────────┐  provider account ref  ┌──────────────────────┐
│ Merchant         │────────────►│ Merchant           │◄───────────────────────│ Payment provider     │
│ Onboarding       │  (gateway   │ Management         │                        │ adapters (Razorpay,  │
│ (KYB data, docs) │  decision)  │ (status, branding, │                        │ Stripe Connect, fake)│
└──────────────────┘             │  pricing, methods) │                        └──────────▲───────────┘
                                 └────┬───────────────┘                                   │ port
              payment profile (public-api.ts)│                                            │
        ┌─────────────────────────────┼───────────────────────────────┐                   │
        ▼                             ▼                               ▼                   │
 ┌─────────────┐   order paid   ┌─────────────┐   refund of     ┌─────────────┐           │
 │ Orders      │◄───────────────│ Payments    │◄────────────────│ Refunds     │───────────┤
 └──────▲──────┘                └──────┬──────┘                 └──────┬──────┘           │
        │ creates order               │ events (outbox)               │                   │
 ┌──────┴──────┐                      ▼                               ▼                   │
 │ Payment     │               ┌─────────────┐  fee calc   ┌──────────────────┐           │
 │ Links       │               │ Ledger      │◄────────────│ Platform Fees    │           │
 └─────────────┘               └──────▲──────┘             └──────────────────┘           │
                                      │ matches                                           │
                               ┌──────┴────────────────┐  imports reports                 │
                               │ Settlements &         │──────────────────────────────────┘
                               │ Reconciliation        │
                               └───────────────────────┘
 Webhooks (inbound provider events → contexts; outbound PayCo-signed events → merchants)
 Payouts (separate payout-partner port; FBO model) · Disputes · Invoices/Subscriptions
 Reporting & Audit (read models; never authoritative for money) · Notifications
```

Relationships:

- **Merchant Management → others**: *open host service* via `modules/merchants/public-api.ts`.
- **Payment provider adapters**: *anti-corruption layer*. Provider vocabulary (e.g. Razorpay
  `receipt`, `X-Razorpay-Signature`) never leaves `integrations/payment-providers/razorpay`.
- **Payments → Orders / Ledger / Webhooks**: domain events via the transactional outbox
  (asynchronous, at-least-once).
- **Reporting & Audit**: *conformist* read models built from events; authoritative financial state
  stays in Orders/Payments/Refunds/Ledger.

Ownership details and permitted access: [`module-ownership.md`](./module-ownership.md).

## 4. Pay-in lifecycle (PRD §5.1, §7.1)

```
Merchant server        PayCo API                 PostgreSQL                 Gateway            Workers
     │ POST /v1/orders     │                          │                         │                  │
     │ Idempotency-Key ───►│ auth (API key) ─ validate│                         │                  │
     │                     │── tx1: claim key, insert order(created), outbox ──►│                  │
     │                     │──────────────────── create provider order ────────►│                  │
     │                     │── tx2: order→awaiting_payment, mapping, complete key►                 │
     │◄── 201 {checkout.url}                          │                         │                  │
 customer pays on PayCo checkout (gateway-hosted card fields) ────────────────►│                  │
     │                     │◄──────── provider webhook (raw body + signature) ──│                  │
     │                     │ verify signature on raw bytes; persist event; 2xx │                  │
     │                     │                          │◄── process idempotently ───────────────────│
     │                     │                          │   payment state, ledger postings, outbox   │
     │◄────────────────────── PayCo-signed webhook (payment.succeeded), retried ≤24h ─────────────│
     │                     │          nightly reconciliation vs settlement reports ──────────────│
```

Implemented end-to-end: order creation (first four arrows). Implemented as tested domain/application
cores but not yet persisted or wired: webhook ingestion, payment event application, ledger postings,
outbound signed webhooks, reconciliation (see the checklist).

### Reliability rules

1. **No network call inside a DB transaction.** tx1 commits before the gateway call; tx2 records the
   result. `UnitOfWork` documents and the use case follows this.
2. **Outcome taxonomy for every gateway call.** Adapters raise exactly one of: `rejected`
   (definitive), `unavailable` (not processed; safe to retry), `outcome unknown` (may have been
   processed: reconcile first), `capability` errors.
3. **Never retry a possibly-successful money movement blindly.** On *unknown*, the order stays
   `created`, the idempotency lease is released, an `order.provider_sync_required` event is written,
   and a retry with the same key first calls `findOrderByReference` (PayCo order id is the provider
   reference) before creating anything.
4. **Idempotency keys** are stored in PostgreSQL (authoritative), scoped by merchant + operation,
   bound to a request hash, with a lease for crash recovery. Outcomes (success body or error code)
   are replayed verbatim for 24 hours.
5. **Transactional outbox.** Domain events are written in the same transaction as the state change;
   the relay publishes to SQS with `FOR UPDATE SKIP LOCKED` leasing. Delivery is at-least-once;
   consumers deduplicate on event id.
6. **Optimistic concurrency** on aggregates (`version` column, compare-and-set update). Duplicate
   or out-of-order provider events are either no-ops (`markPaid` on a paid order) or rejected
   transitions that the webhook processor records and reconciles.
7. **Retry with exponential backoff + full jitter** (`backoffWithJitter`); exhausted consumer
   retries go to each SQS queue's **dead-letter queue** via redrive policy; DLQ messages can be
   replayed manually with an audit record (Phase 3).

## 5. Asynchronous processing

All workers share this codebase and Docker image and run as separate processes:

| Process | Entry point | Status |
|---|---|---|
| API | `dist/main.js` | Phase 1 |
| Outbox relay | `dist/workers/outbox-relay/main.js` | Phase 1 |
| Provider webhook processing | `dist/workers/provider-webhook-processing/main.js` | entry point; handler Phase 3 |
| Payment status sync (consumes `*.provider_sync_required`, polls gateway) | `dist/workers/payment-status-sync/main.js` | entry point; handler Phase 3 |
| Outbound webhook delivery (24h retries, DLQ) | `dist/workers/webhook-delivery/main.js` | entry point; handler Phase 4 |
| Settlement report import | `dist/workers/settlement-import/main.js` | entry point; handler Phase 4 |
| Daily reconciliation | `dist/workers/reconciliation/main.js` | entry point; handler Phase 4 |
| Notification delivery | `dist/workers/notification-delivery/main.js` | entry point; handler Phase 5 |
| Invoice / subscription scheduler | `dist/workers/billing-scheduler/main.js` | entry point; Phase 5 |

Queue workers share `SqsQueueConsumer` (long polling; delete on success; on failure the message
stays invisible for an exponential, jittered delay; SQS redrives to the DLQ after
`maxReceiveCount`). Workers whose handler is not implemented **refuse to start** (exit code 1),
so a deployment cannot silently drop messages.

Queues (provisioned by infrastructure-as-code, not by the app): one standard SQS queue per
consumer with a redrive policy (`maxReceiveCount` ≈ 5–10) to a dedicated DLQ. FIFO queues are
supported by the publisher (`MessageGroupId` = aggregate) where per-aggregate ordering matters.

## 6. Data stores

- **PostgreSQL** — the only authoritative store: orders, payments, ledger, idempotency, outbox.
- **Redis** — distributed rate limiting (`RedisThrottlerStorage`), later short-lived locks and
  caches. Losing Redis never loses financial data. Optional in development/test.
- **S3** — onboarding documents and generated reports (Phase 2/5), SSE-KMS, access via short-lived
  pre-signed URLs, lifecycle rules for retention.
- **AWS Secrets Manager** — provider credentials, API-key pepper, webhook signing secrets.

> The brief lists "node cache for distributed coordination". An in-process cache cannot coordinate
> across instances, so Redis is used for those duties (as the brief also requests elsewhere).

## 7. Security model

- **Tenant isolation**: `MerchantContext` comes only from the authenticated credential. Repository
  reads are merchant-scoped (`findForMerchant`); other tenants' resources return `404`. Every
  merchant-owned table carries `merchant_id`; `orders` exposes `(merchant_id, id)` as a composite
  key so child tables can enforce same-merchant foreign keys. PostgreSQL row-level security is a
  candidate hardening step (checklist, Phase 2).
- **API keys**: `sk_{mode}_{keyId}_{secret}`; only HMAC-SHA256(pepper, secret) is stored; constant-
  time comparison; revocation and expiry checked on every request; keys shown once.
- **Passwords** (Phase 2): Argon2id. **Refresh tokens**: opaque, hashed at rest, rotated on use with
  reuse detection that revokes the token family.
- **Transport/headers**: Helmet, HSTS in deployed environments, strict CORS allow-list (https only
  outside dev), 100 kB JSON body limit, `trust proxy` = 1 hop.
- **Rate limiting**: per API key id (else per IP), Redis-backed across instances.
- **Logging**: pino with redaction of auth headers, signatures, secrets and financial identifiers;
  bodies and query strings are never logged; every log line carries the request id. `pino-pretty`
  is used only in development when that package is installed; deployed images log JSON to stdout.
- **Webhook signatures** are verified against the raw body (`rawBody: true`) before parsing.
- **Configuration**: staging/production refuse env-file secrets, the fake provider, missing Redis,
  non-https CORS origins and the public Swagger UI.

## 8. Configuration per environment

| | development | test | staging | production |
|---|---|---|---|---|
| `.env` file | loaded | ignored (tests set env) | ignored | ignored |
| Secrets | `SECRET_*` env vars | env vars | Secrets Manager | Secrets Manager |
| Fake provider | allowed | allowed | rejected | rejected |
| Redis | optional | optional | required | required |
| Swagger UI | on | on | optional | off |
