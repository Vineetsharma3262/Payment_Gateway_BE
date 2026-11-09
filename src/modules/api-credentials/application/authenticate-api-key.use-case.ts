import {
  AuthenticationFailedError,
  type ApiKeyAuthenticator,
} from '../../../shared/application/authentication.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { MerchantContext } from '../../../shared/application/merchant-context';
import type { ApiKeyRepository } from '../domain/api-key.repository';
import type { ApiKeySecretHasher } from './api-key-secret-hasher.port';
import { parseApiKey } from './api-key-format';

export class AuthenticateApiKeyUseCase implements ApiKeyAuthenticator {
  constructor(
    private readonly keys: ApiKeyRepository,
    private readonly hasher: ApiKeySecretHasher,
    private readonly clock: Clock,
  ) {}

  async authenticate(presentedKey: string): Promise<MerchantContext> {
    const parsed = parseApiKey(presentedKey);
    if (!parsed) throw new AuthenticationFailedError();

    const key = await this.keys.findById(parsed.keyId);
    if (
      !key ||
      key.mode !== parsed.mode ||
      !this.hasher.matches(parsed.secret, key.secretHash) ||
      !key.isUsableAt(this.clock.now())
    ) {
      throw new AuthenticationFailedError();
    }

    return { merchantId: key.merchantId, mode: key.mode, actor: { type: 'api_key', id: key.id } };
  }
}
