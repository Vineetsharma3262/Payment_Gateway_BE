/**
 * An authenticated dashboard user (JWT session). `merchantId`/`role` describe
 * the merchant workspace the session is bound to; platform administrators may
 * have none.
 */
export interface UserContext {
  readonly userId: string;
  readonly sessionFamilyId: string;
  readonly merchantId: string | null;
  readonly role: string | null;
  readonly isPlatformAdmin: boolean;
}
