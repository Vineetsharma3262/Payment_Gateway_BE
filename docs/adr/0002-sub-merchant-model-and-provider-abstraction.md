# ADR-0002: Sub-merchant model behind a provider-neutral port with a capability matrix

- Status: Accepted (gateway contract pending — see open questions Q1–Q3)
- Date: 2026-10-27

## Context

PRD §3 chooses model A (each client gets its own gateway account; funds settle gateway → client
bank; PayCo never holds client funds) and rejects model B (master merchant; would require money
transmitter licensing). Razorpay US does not publicly list a platform/white-label programme, fee
split or US payouts (§2). The decision gate says: if Razorpay cannot support model A, use a gateway
that does (e.g. Stripe Connect) behind the same PayCo layer.

## Decision

- PayCo stores one `merchant_provider_accounts` row per merchant per mode. Every gateway call is
  made **server-to-server** on behalf of that account; clients never receive gateway secrets.
- A **provider-neutral `PaymentProvider` port** exposes PayCo-shaped commands/results (Money,
  PayCo references) — never SDK objects.
- Each adapter declares a **capability matrix** (`supported` / `unconfirmed` / `unsupported`).
  Unsupported always fails explicitly; *unconfirmed* is allowed only in test mode, so nothing in
  live mode relies on a capability the contract has not confirmed.
- Razorpay adapter: pay-in primitives `supported`; sub-merchant creation, KYB submission, fee
  split, statement descriptors, settlement/recon APIs `unconfirmed` and not implemented.
- Stripe Connect adapter: present with everything `unconfirmed`, no calls implemented.
- Fake adapter: full behaviour for tests and local development; excluded from staging/production.
- No pooled balance, wallet, or master-merchant flow exists anywhere in the model.
- **Platform fees**: if fee split is confirmed, it is recorded from the provider's split data;
  otherwise PayCo calculates fees from versioned fee schedules and bills merchants monthly
  (PRD §3 fallback). The ledger models both without implying PayCo held the funds.
- **Payouts** use a separate `PayoutProvider` port; balances are the partner's FBO account
  balances mirrored for display, never PayCo funds.

## Consequences

- Switching gateways is an adapter + account migration; the public API is unchanged.
- Features the chosen gateway lacks surface as explicit `capability_not_supported` errors rather
  than silent degradation.
- Going live requires the open questions to be answered and the matrix updated accordingly.
