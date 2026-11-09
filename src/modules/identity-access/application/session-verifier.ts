import {
  InvalidTokenError,
  type AccessTokenVerifier,
} from '../../../shared/application/authorization.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { UserContext } from '../../../shared/application/user-context';
import type { SessionRepository } from '../domain/identity.repositories';
import type { AccessTokenService } from './identity.ports';

/** Signature + expiry, then confirms the session family was not revoked (logout, reuse, reset). */
export class SessionVerifier implements AccessTokenVerifier {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async verify(token: string): Promise<UserContext> {
    const claims = await this.accessTokens.verify(token);
    if (!(await this.sessions.isFamilyActive(claims.sessionFamilyId, this.clock.now()))) {
      throw new InvalidTokenError();
    }
    return {
      userId: claims.userId,
      sessionFamilyId: claims.sessionFamilyId,
      merchantId: claims.merchantId,
      role: claims.role,
      isPlatformAdmin: claims.isPlatformAdmin,
    };
  }
}
