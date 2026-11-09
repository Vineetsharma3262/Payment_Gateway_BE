import type { ApiKeyMode } from '../domain/api-key';

/**
 * Presented key: `sk_{mode}_{keyIdSuffix}_{secret}` — both segments base62.
 * The key id is stored as `key_{keyIdSuffix}`; only a keyed hash of `secret`
 * is stored. The full key is shown to the merchant exactly once.
 */
const PATTERN = /^sk_(test|live)_([A-Za-z0-9]{16,40})_([A-Za-z0-9]{32,64})$/;

export interface ParsedApiKey {
  mode: ApiKeyMode;
  keyId: string;
  secret: string;
}

export function parseApiKey(presented: string): ParsedApiKey | null {
  const match = PATTERN.exec(presented);
  if (!match) return null;
  return { mode: match[1] as ApiKeyMode, keyId: `key_${match[2]}`, secret: match[3] };
}

export function formatApiKey(mode: ApiKeyMode, keyId: string, secret: string): string {
  return `sk_${mode}_${keyId.replace(/^key_/, '')}_${secret}`;
}
