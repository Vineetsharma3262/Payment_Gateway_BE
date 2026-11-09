import {
  MerchantNotPermittedError,
  ResourceNotFoundError,
} from '../../../shared/application/application-error';
import { parseApiKey } from '../../../modules/api-credentials/application/api-key-format';
import { ApiKeyUseCases } from '../../../modules/api-credentials/application/api-key.use-cases';
import { AuthenticateApiKeyUseCase } from '../../../modules/api-credentials/application/authenticate-api-key.use-case';
import { HmacApiKeySecretHasher } from '../../../modules/api-credentials/infrastructure/hmac-api-key-secret-hasher';
import {
  activeMerchant,
  FixedClock,
  InMemoryMerchantProfiles,
  PassThroughUnitOfWork,
  SequentialIdGenerator,
} from '../../support/fakes';
import { InMemoryApiKeys, RecordingAuditLog } from '../../support/platform-fakes';
import { RandomTokenGenerator } from '../../../shared/infrastructure/system/random-token-generator';

function setup() {
  const clock = new FixedClock();
  const keys = new InMemoryApiKeys();
  const hasher = new HmacApiKeySecretHasher('p'.repeat(40));
  const profiles = new InMemoryMerchantProfiles()
    .add(activeMerchant('mer_live'))
    .add(activeMerchant('mer_new', { status: 'onboarding', liveChargesEnabled: false }));
  const useCases = new ApiKeyUseCases({
    unitOfWork: new PassThroughUnitOfWork(),
    keys,
    hasher,
    merchants: profiles,
    audit: new RecordingAuditLog(),
    tokens: new RandomTokenGenerator(),
    ids: new SequentialIdGenerator(),
    clock,
  });
  return { useCases, keys, auth: new AuthenticateApiKeyUseCase(keys, hasher, clock), clock };
}

const actor = { type: 'user' as const, id: 'usr_1' };

describe('API key management', () => {
  it('returns the secret once, stores only its keyed hash, and the key authenticates', async () => {
    const { useCases, keys, auth } = setup();
    const issued = await useCases.issue({
      merchantId: 'mer_live',
      mode: 'test',
      label: 'server',
      actor,
    });
    expect(parseApiKey(issued.secret)).not.toBeNull();
    const stored = keys.rows.get(issued.id)!;
    expect(JSON.stringify(stored)).not.toContain(parseApiKey(issued.secret)!.secret);
    await expect(auth.authenticate(issued.secret)).resolves.toMatchObject({
      merchantId: 'mer_live',
      mode: 'test',
    });
    expect((await useCases.list('mer_live'))[0]).not.toHaveProperty('secret');
  });

  it('issues live keys only after onboarding approval', async () => {
    const { useCases } = setup();
    await expect(
      useCases.issue({ merchantId: 'mer_new', mode: 'live', label: 'x', actor }),
    ).rejects.toBeInstanceOf(MerchantNotPermittedError);
    await expect(
      useCases.issue({ merchantId: 'mer_live', mode: 'live', label: 'x', actor }),
    ).resolves.toMatchObject({ mode: 'live' });
  });

  it('revocation is immediate and merchant-scoped', async () => {
    const { useCases, auth } = setup();
    const issued = await useCases.issue({
      merchantId: 'mer_live',
      mode: 'test',
      label: 'x',
      actor,
    });
    await expect(useCases.revoke('mer_new', issued.id, actor)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    await useCases.revoke('mer_live', issued.id, actor);
    await expect(auth.authenticate(issued.secret)).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });
});
