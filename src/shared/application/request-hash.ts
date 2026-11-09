/**
 * Canonical JSON (sorted keys) so that semantically equal requests hash equally
 * regardless of property order. Hashing itself happens in infrastructure; this
 * only defines the canonical form shared by every adapter.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export interface Hasher {
  sha256Hex(input: string): string;
}

export const HASHER = Symbol('Hasher');
