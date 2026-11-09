# ADR-0003: Idempotency, transactional outbox and uncertain provider outcomes

- Status: Accepted
- Date: 2026-10-27

## Context

Network calls to the gateway cannot be part of a database transaction. A timeout after the gateway
processed a request is indistinguishable from one before. Clients retry. Webhooks arrive
duplicated and out of order. PRD §7.2 requires idempotency keys on all create calls.

## Decision

1. **Idempotency records in PostgreSQL**, unique on `(merchant_id, scope, key)`, bound to a
   SHA-256 of the canonical request. Claimed with `INSERT … ON CONFLICT DO NOTHING` inside the
   same transaction that creates the resource, with a lease (`locked_until`) for crash recovery.
   Completed outcomes (success body or error code) are replayed for 24 hours. Reuse with a
   different payload → `422 idempotency_key_reused`; concurrent duplicate → `409 idempotency_key_in_progress`.
2. **Two-transaction pattern around gateway calls**: tx1 persists intent + outbox event; call the
   gateway; tx2 persists the result + completes the key.
3. **Gateway outcome taxonomy** (`rejected`, `unavailable`, `outcome unknown`, `capability`).
   *Unknown* never triggers a blind retry. The resource stays in its pre-call state, a
   `*.provider_sync_required` event is emitted, and the next attempt (client retry or the
   status-sync worker) first looks the resource up at the gateway by PayCo reference.
   For money-moving operations (refunds, payouts) PayCo passes its idempotency key to the gateway
   when supported and otherwise reconciles before any retry.
4. **Transactional outbox** for all domain events; relay to SQS at-least-once; consumers dedupe by
   event id; outbound merchant webhooks carry stable event ids for merchant-side dedupe.

## Consequences

- No lost events, no double creation from client retries, explicit handling of uncertainty.
- Clients may see `503 provider_outcome_unknown` and must retry with the same key — documented in
  the API reference.
- Some latency added by two short transactions per create; acceptable.
