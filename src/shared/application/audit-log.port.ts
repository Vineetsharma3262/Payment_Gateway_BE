/**
 * Append-only audit trail for administrative and financial actions. Written
 * inside the caller's unit of work so the record commits with the change.
 */
export interface AuditEntry {
  merchantId: string | null;
  actor: { type: 'user' | 'api_key' | 'system' | 'provider'; id: string };
  action: string;
  resource: { type: string; id: string };
  /** Non-sensitive context only (ids, old/new status). Never secrets or personal data. */
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOG = Symbol('AuditLog');
