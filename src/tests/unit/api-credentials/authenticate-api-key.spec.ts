import { AuthenticationFailedError } from '../../../shared/application/authentication.port';
import {
  formatApiKey,
  parseApiKey,
} from '../../../modules/api-credentials/application/api-key-format';
import { AuthenticateApiKeyUseCase } from '../../../modules/api-credentials/application/authenticate-api-key.use-case';
import { ApiKey, type ApiKeyProps } from '../../../modules/api-credentials/domain/api-key';
import type { ApiKeyRepository } from '../../../modules/api-credentials/domain/api-key.repository';
import { HmacApiKeySecretHasher } from '../../../modules/api-credentials/infrastructure/hmac-api-key-secret-hasher';
import { FixedClock } from '../../support/fakes';

const hasher = new HmacApiKeySecretHasher('test-pepper-0123456789abcdef0123456789');
const SECRET = 'S'.repeat(32);
const KEY_ID = 'key_' + 'A'.repeat(24);

function setup(overrides: Partial<ApiKeyProps> = {}) {
  const clock = new FixedClock();
  const props: ApiKeyProps = {
    id: KEY_ID,
    merchantId: 'mer_A',
    mode: 'test',
    label: 'test',
    secretHash: hasher.hash(SECRET),
    last4: SECRET.slice(-4),
    createdAt: new Date('2026-01-01'),
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
  const repo = {
    findById: (id: string) => Promise.resolve(id === props.id ? ApiKey.rehydrate(props) : null),
  } as ApiKeyRepository;
  return { useCase: new AuthenticateApiKeyUseCase(repo, hasher, clock), clock };
}

describe('API key authentication', () => {
  it('round-trips the key format', () => {
    const presented = formatApiKey('live', KEY_ID, SECRET);
    expect(parseApiKey(presented)).toEqual({ mode: 'live', keyId: KEY_ID, secret: SECRET });
    expect(parseApiKey('sk_test_short_x')).toBeNull();
  });

  it('authenticates a valid key and returns its merchant context', async () => {
    const { useCase } = setup();
    await expect(useCase.authenticate(formatApiKey('test', KEY_ID, SECRET))).resolves.toEqual({
      merchantId: 'mer_A',
      mode: 'test',
      actor: { type: 'api_key', id: KEY_ID },
    });
  });

  it.each([
    ['wrong secret', {}, formatApiKey('test', KEY_ID, 'X'.repeat(32))],
    ['mode mismatch', {}, formatApiKey('live', KEY_ID, SECRET)],
    ['unknown key', {}, formatApiKey('test', 'key_' + 'B'.repeat(24), SECRET)],
    ['malformed', {}, 'not-a-key'],
    ['revoked', { revokedAt: new Date('2026-01-01') }, formatApiKey('test', KEY_ID, SECRET)],
    ['expired', { expiresAt: new Date('2026-01-01') }, formatApiKey('test', KEY_ID, SECRET)],
  ])('rejects %s with an uninformative error', async (_label, overrides, presented) => {
    const { useCase } = setup(overrides);
    await expect(useCase.authenticate(presented)).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it('stops accepting a key as soon as it is revoked', async () => {
    const { useCase, clock } = setup({ revokedAt: new Date('2026-10-27T12:00:05Z') });
    await expect(useCase.authenticate(formatApiKey('test', KEY_ID, SECRET))).resolves.toBeDefined();
    clock.advance(5_000);
    await expect(useCase.authenticate(formatApiKey('test', KEY_ID, SECRET))).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });
});
