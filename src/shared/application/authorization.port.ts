import { ApplicationError } from './application-error';
import type { UserContext } from './user-context';

import type { Permission } from '../domain/permissions';

export { PERMISSIONS, type Permission } from '../domain/permissions';

export interface PermissionChecker {
  can(role: string | null, permission: Permission): boolean;
}

export const PERMISSION_CHECKER = Symbol('PermissionChecker');

/** Verifies a dashboard access token and that its session is still active. */
export interface AccessTokenVerifier {
  verify(token: string): Promise<UserContext>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol('AccessTokenVerifier');

export class InvalidTokenError extends ApplicationError {
  readonly code = 'INVALID_TOKEN';

  constructor() {
    super('The session is invalid or has expired.');
  }
}
