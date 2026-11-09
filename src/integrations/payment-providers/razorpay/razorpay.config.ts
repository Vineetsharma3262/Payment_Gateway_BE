import type { ProviderMode } from '../domain-ports/payment-provider.port';

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface RazorpayAdapterConfig {
  baseUrl: string;
  timeoutMs: number;
  /** Resolved from the secret manager per mode; never from request data. */
  credentials: (mode: ProviderMode) => Promise<RazorpayCredentials>;
}
