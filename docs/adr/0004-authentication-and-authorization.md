# ADR-0004: Authentication and authorization

- Status: Accepted
- Date: 2026-10-27

## Context

Two kinds of callers: merchant servers (API) and people using the dashboard (and PayCo
administrators). PRD 5.3/5.4 require instant test keys, live keys after approval, team roles, and
approval workflows for payouts. The brief requires JWT access tokens with secure refresh-token
rotation, Argon2id, hashed API secrets shown once, RBAC and audit.

## Decision

- **Merchant API**: secret keys `sk_{test|live}_{keyId}_{secret}`; only HMAC-SHA256(pepper, secret)
  is stored (high-entropy secret ⇒ keyed hash, not a slow password hash); constant-time compare;
  revocation/expiry checked per request. Test key issued at signup; live keys only when the
  gateway has approved onboarding. Keys never work on dashboard routes and vice versa.
- **Dashboard**: Argon2id (m = 19 MiB, t = 2, p = 1) passwords; lockout after 5 failures for
  15 min; uniform errors and a decoy hash for unknown emails.
  - Access token: HS256 JWT, 15 min, claims `sub`, `sid` (session family), `mid` (merchant
    workspace), `rol`, `adm`; issuer/audience/algorithm pinned.
  - Refresh token: opaque 48-char random value, SHA-256 at rest, single use. Each refresh rotates it
    (compare-and-set) and re-reads the role. Presenting a spent token revokes the whole family and
    is audited (reuse detection). Logout and password reset revoke families.
  - Every authenticated request also checks the session family is still active, so logout and
    reuse detection take effect immediately rather than after access-token expiry.
- **RBAC**: roles owner / admin / developer / finance / support / viewer mapped to a fixed
  permission vocabulary (shared kernel); `@RequirePermissions` on routes. Payout approval is a
  separate permission and maker ≠ checker is enforced in the Payout aggregate.
- **Platform administrators**: `users.is_platform_admin`, `@RequirePlatformAdmin`. To be moved to a
  separate SSO-backed realm and network path before production.
- **Audit**: administrative and financial actions write `audit_records` in the same transaction.

## Consequences

- One DB read per dashboard request (session family) — acceptable; cacheable in Redis later.
- Symmetric JWT keys mean only this service can verify tokens; switch to asymmetric (ES256) if other
  services need to verify.
- Refresh tokens are returned in the body; browsers should hold them via an httpOnly cookie set by
  the dashboard's backend-for-frontend.
