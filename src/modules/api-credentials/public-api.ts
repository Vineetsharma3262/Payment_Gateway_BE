/** Published contract of the API Credentials context (framework-free). */
import type { ApiMode } from '../../shared/application/merchant-context';

export interface IssuedApiKey {
  id: string;
  /** Full secret key. Returned exactly once; only its keyed hash is stored. */
  secret: string;
  mode: ApiMode;
  label: string;
  last4: string;
  createdAt: string;
}

export interface ApiKeyIssuer {
  issue(input: {
    merchantId: string;
    mode: ApiMode;
    label: string;
    actor: { type: 'user' | 'system'; id: string };
  }): Promise<IssuedApiKey>;
}

export const API_KEY_ISSUER = Symbol('ApiKeyIssuer');
