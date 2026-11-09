import type { ProviderEvent } from './provider-event';

export interface ProviderEventRepository {
  /** Inserts unless (provider, providerEventId) exists. Returns false for duplicates. */
  insertIfAbsent(event: ProviderEvent): Promise<boolean>;
}

export const PROVIDER_EVENT_REPOSITORY = Symbol('ProviderEventRepository');
