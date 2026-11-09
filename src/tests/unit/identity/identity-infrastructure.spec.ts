import { InvalidTokenError } from '../../../shared/application/authorization.port';
import { Argon2PasswordHasher } from '../../../modules/identity-access/infrastructure/argon2-password-hasher';
import { JwtAccessTokenService } from '../../../modules/identity-access/infrastructure/jwt-access-token.service';
import { SessionVerifier } from '../../../modules/identity-access/application/session-verifier';
import { RefreshSession } from '../../../modules/identity-access/domain/refresh-session';
import { FixedClock } from '../../support/fakes';
import { InMemorySessions } from '../../support/platform-fakes';

const claims = {
  userId: 'usr_1',
  sessionFamilyId: 'fam_1',
  merchantId: 'mer_1',
  role: 'owner',
  isPlatformAdmin: false,
};

describe('Argon2id password hasher', () => {
  it('produces argon2id hashes and verifies them', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('a long enough passphrase');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(hash, 'a long enough passphrase')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong')).resolves.toBe(false);
    await expect(hasher.verify('not-a-hash', 'x')).resolves.toBe(false);
  });
});

describe('JWT access tokens', () => {
  const service = new JwtAccessTokenService('k'.repeat(40), 900);

  it('round-trips claims', async () => {
    const { token } = await service.issue(claims);
    await expect(service.verify(token)).resolves.toEqual(claims);
  });

  it('rejects tampered, foreign-key and alg=none tokens', async () => {
    const { token } = await service.issue(claims);
    const [h, p] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), adm: true })).toString('base64url')}.${token.split('.')[2]}`;
    await expect(service.verify(forged)).rejects.toBeInstanceOf(InvalidTokenError);
    const other = await new JwtAccessTokenService('x'.repeat(40), 900).issue(claims);
    await expect(service.verify(other.token)).rejects.toBeInstanceOf(InvalidTokenError);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    await expect(service.verify(none)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('refuses short signing keys', () => {
    expect(() => new JwtAccessTokenService('short', 900)).toThrow();
  });
});

describe('Session verifier', () => {
  it('rejects valid JWTs whose session family was revoked (logout, reuse, reset)', async () => {
    const tokens = new JwtAccessTokenService('k'.repeat(40), 900);
    const sessions = new InMemorySessions();
    const clock = new FixedClock();
    await sessions.insert(
      RefreshSession.issue({
        id: 'ses_1',
        userId: 'usr_1',
        familyId: 'fam_1',
        merchantId: 'mer_1',
        tokenHash: 'h'.repeat(64),
        expiresAt: new Date(clock.now().getTime() + 3600_000),
        createdAt: clock.now(),
      }),
    );
    const verifier = new SessionVerifier(tokens, sessions, clock);
    const { token } = await tokens.issue(claims);
    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: 'usr_1',
      merchantId: 'mer_1',
    });
    await sessions.revokeFamily('fam_1', clock.now());
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
