/**
 * The authenticated tenant for a request. Every merchant-owned query and
 * command takes this as input; use cases never trust a merchant id taken from
 * a request body or path.
 */
export type ApiMode = 'test' | 'live';

export interface MerchantContext {
  readonly merchantId: string;
  readonly mode: ApiMode;
  /** The API credential or user session that authenticated the call (for audit). */
  readonly actor: { readonly type: 'api_key' | 'user'; readonly id: string };
}
