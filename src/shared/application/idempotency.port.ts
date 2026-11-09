/**
 * Idempotency for financial create operations (PRD 7.2: "Idempotency keys on all
 * create calls"). Records live in PostgreSQL, the authoritative store, keyed by
 * (merchant, scope, key). A key is bound to the hash of the original request so
 * that reuse with a different body is rejected.
 */
export interface IdempotencyScopeKey {
  merchantId: string;
  scope: string;
  key: string;
}

/** What the original request produced. Errors are stored by code; HTTP mapping stays in presentation. */
export type StoredOutcome =
  | { kind: 'success'; body: unknown }
  | { kind: 'error'; code: string; message: string; details?: Record<string, unknown> };

export type IdempotencyClaim =
  /** First time this key is seen; caller owns it and must complete it. */
  | { kind: 'claimed'; recordId: string }
  /** A previous attempt stopped before completing and its lease expired; caller now owns it. */
  | { kind: 'resumed'; recordId: string; resourceId: string | null }
  /** The original request finished; return the stored response verbatim. */
  | { kind: 'replay'; outcome: StoredOutcome }
  /** Another request with this key holds a live lease. */
  | { kind: 'in_progress' }
  /** Same key, different request payload. */
  | { kind: 'payload_mismatch' };

export interface IdempotencyStore {
  /** Must be called inside a unit of work so the claim commits with the created resource. */
  claim(
    input: IdempotencyScopeKey & { requestHash: string; leaseMs: number },
  ): Promise<IdempotencyClaim>;
  attachResource(recordId: string, resourceId: string): Promise<void>;
  complete(recordId: string, outcome: StoredOutcome): Promise<void>;
  /** Releases the lease without completing so a client retry can resume immediately. */
  release(recordId: string): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
