import type { ApiKey } from './api-key';

export interface ApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  listForMerchant(merchantId: string): Promise<ApiKey[]>;
  insert(key: ApiKey): Promise<void>;
  save(key: ApiKey): Promise<void>;
}

export interface ApiRequestLogEntry {
  merchantId: string;
  apiKeyId: string;
  mode: 'test' | 'live';
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  requestId: string | null;
  idempotencyKey: string | null;
}

export interface ApiRequestLogStore {
  append(entry: ApiRequestLogEntry): Promise<void>;
  list(
    merchantId: string,
    page: { limit: number; startingAfter?: string },
  ): Promise<{
    items: (ApiRequestLogEntry & { id: string; createdAt: Date })[];
    hasMore: boolean;
    nextCursor: string | null;
  }>;
}

export const API_KEY_REPOSITORY = Symbol('ApiKeyRepository');
export const API_REQUEST_LOG_STORE = Symbol('ApiRequestLogStore');
