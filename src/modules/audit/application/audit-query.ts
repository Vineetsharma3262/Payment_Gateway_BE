import type { Page, PageRequest } from '../../../shared/application/pagination';

export interface AuditRecordDto {
  id: string;
  merchantId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface AuditFilter {
  merchantId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
}

/** Read side of the audit trail (internal administrators only). */
export interface AuditQuery {
  search(filter: AuditFilter, page: PageRequest): Promise<Page<AuditRecordDto>>;
}

export const AUDIT_QUERY = Symbol('AuditQuery');
