import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { SecretsProvider } from '../../shared/application/secrets.port';

/** Short TTL so rotated secrets are picked up without a restart. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export class AwsSecretsManagerProvider implements SecretsProvider {
  private readonly cache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly client: SecretsManagerClient,
    private readonly namespace: string,
  ) {}

  async getString(name: string): Promise<string> {
    const secretId = `${this.namespace}/${name}`;
    const cached = this.cache.get(secretId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const result = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!result.SecretString) throw new Error(`Secret '${secretId}' has no string value.`);
    this.cache.set(secretId, { value: result.SecretString, expiresAt: Date.now() + CACHE_TTL_MS });
    return result.SecretString;
  }

  async getJson<T>(name: string): Promise<T> {
    return JSON.parse(await this.getString(name)) as T;
  }
}
