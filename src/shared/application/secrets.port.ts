/** Resolves secrets by logical name (e.g. `razorpay/test`). Values must never be logged. */
export interface SecretsProvider {
  getString(name: string): Promise<string>;
  getJson<T>(name: string): Promise<T>;
}

export const SECRETS_PROVIDER = Symbol('SecretsProvider');
