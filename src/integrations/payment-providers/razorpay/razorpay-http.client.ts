import {
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderUnavailableError,
} from '../domain-ports/provider-errors';
import type { ProviderMode } from '../domain-ports/payment-provider.port';
import type { RazorpayAdapterConfig } from './razorpay.config';

const PROVIDER = 'razorpay';
/** Network errors raised before the request could reach the provider. */
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET_BEFORE_SEND',
]);

interface RequestOptions {
  mode: ProviderMode;
  operation: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  /** Sub-merchant scoping header. Mechanism for Razorpay US is unconfirmed (docs/open-questions.md). */
  accountId?: string;
}

/**
 * Minimal server-to-server client. Maps transport outcomes to the provider error
 * taxonomy so callers can decide whether a retry is safe:
 *   - 4xx (except 429)         → rejected (definitive)
 *   - 429 / connection refused → unavailable (not processed)
 *   - timeout / 5xx            → outcome unknown (must reconcile)
 */
export class RazorpayHttpClient {
  constructor(private readonly config: RazorpayAdapterConfig) {}

  async request<T>(options: RequestOptions): Promise<T> {
    const credentials = await this.config.credentials(options.mode);
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
      Accept: 'application/json',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.accountId) headers['X-Razorpay-Account'] = options.accountId;

    let response: Response;
    try {
      response = await fetch(new URL(options.path, this.config.baseUrl), {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const code = errorCode(error);
      if (code && NOT_SENT_CODES.has(code)) {
        throw new ProviderUnavailableError(PROVIDER, options.operation, code);
      }
      // A GET can be repeated safely; for a POST we cannot know whether it was processed.
      if (options.method === 'GET')
        throw new ProviderUnavailableError(PROVIDER, options.operation, code);
      throw new ProviderOutcomeUnknownError(PROVIDER, options.operation, code ?? 'network error');
    }

    if (response.ok) return (await response.json()) as T;

    const description = await safeErrorDescription(response);
    if (response.status === 429) {
      throw new ProviderUnavailableError(PROVIDER, options.operation, 'rate limited');
    }
    if (response.status >= 400 && response.status < 500) {
      throw new ProviderRejectedError(PROVIDER, options.operation, description);
    }
    if (options.method === 'GET') {
      throw new ProviderUnavailableError(PROVIDER, options.operation, `HTTP ${response.status}`);
    }
    throw new ProviderOutcomeUnknownError(PROVIDER, options.operation, `HTTP ${response.status}`);
  }
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && error.name === 'TimeoutError') return 'TIMEOUT';
  const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

/** Only the provider's error description is kept; full bodies may contain customer data. */
async function safeErrorDescription(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { description?: unknown } };
    const description = body.error?.description;
    return typeof description === 'string' ? description.slice(0, 200) : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
