import type { SecretsProvider } from '../../shared/application/secrets.port';

/**
 * Development/test only (rejected for staging/production by environment
 * validation). Secret `razorpay/test` is read from env var `SECRET_RAZORPAY_TEST`.
 */
export class EnvSecretsProvider implements SecretsProvider {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  static variableName(name: string): string {
    return `SECRET_${name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`;
  }

  getString(name: string): Promise<string> {
    const value = this.env[EnvSecretsProvider.variableName(name)];
    if (!value) {
      return Promise.reject(
        new Error(`Secret '${name}' is not configured (${EnvSecretsProvider.variableName(name)}).`),
      );
    }
    return Promise.resolve(value);
  }

  async getJson<T>(name: string): Promise<T> {
    return JSON.parse(await this.getString(name)) as T;
  }
}
