export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  userId: string;
  sessionFamilyId: string;
  merchantId: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<{ token: string; expiresInSeconds: number }>;
  /** Throws InvalidTokenError on bad signature, wrong audience/issuer or expiry. */
  verify(token: string): Promise<AccessTokenClaims>;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
export const ACCESS_TOKEN_SERVICE = Symbol('AccessTokenService');
