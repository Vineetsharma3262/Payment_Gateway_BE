import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { InvalidTokenError } from '../../../shared/application/authorization.port';
import type { AccessTokenClaims, AccessTokenService } from '../application/identity.ports';

const ISSUER = 'payco';
const AUDIENCE = 'payco-dashboard';

interface Payload {
  sub: string;
  sid: string;
  mid: string | null;
  rol: string | null;
  adm: boolean;
}

/** HS256 with a key from the secret manager; algorithm pinned on verify. */
export class JwtAccessTokenService implements AccessTokenService {
  constructor(
    private readonly signingKey: string,
    private readonly ttlSeconds: number,
  ) {
    if (signingKey.length < 32) throw new Error('JWT signing key must be at least 32 characters.');
  }

  issue(claims: AccessTokenClaims): Promise<{ token: string; expiresInSeconds: number }> {
    const payload: Payload = {
      sub: claims.userId,
      sid: claims.sessionFamilyId,
      mid: claims.merchantId,
      rol: claims.role,
      adm: claims.isPlatformAdmin,
    };
    const token = jwt.sign(payload, this.signingKey, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: this.ttlSeconds,
      jwtid: randomUUID(),
    });
    return Promise.resolve({ token, expiresInSeconds: this.ttlSeconds });
  }

  verify(token: string): Promise<AccessTokenClaims> {
    try {
      const p = jwt.verify(token, this.signingKey, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      }) as Payload;
      return Promise.resolve({
        userId: p.sub,
        sessionFamilyId: p.sid,
        merchantId: p.mid,
        role: p.rol,
        isPlatformAdmin: p.adm === true,
      });
    } catch {
      return Promise.reject(new InvalidTokenError());
    }
  }
}
