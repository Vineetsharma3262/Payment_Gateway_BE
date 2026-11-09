import { InvalidEmailError } from './identity.errors';

/** Lower-cased, trimmed. Deliverability is proven by email verification, not by this check. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InvalidEmailError();
  return email;
}
