import { ApplicationError } from './application-error';
import type { MerchantContext } from './merchant-context';

/** Implemented by the API Credentials context; consumed by the shared API-key guard. */
export interface ApiKeyAuthenticator {
  authenticate(presentedKey: string): Promise<MerchantContext>;
}

export const API_KEY_AUTHENTICATOR = Symbol('ApiKeyAuthenticator');

/** Deliberately uninformative: never reveal whether a key exists, is revoked or expired. */
export class AuthenticationFailedError extends ApplicationError {
  readonly code = 'AUTHENTICATION_FAILED';

  constructor() {
    super('Invalid or missing API key.');
  }
}
