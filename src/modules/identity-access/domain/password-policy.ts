import { WeakPasswordError } from './identity.errors';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * NIST SP 800-63B style: length over composition rules, reject trivially
 * guessable values. Breached-password screening is a planned addition.
 */
export function assertAcceptablePassword(password: string, email: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new WeakPasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new WeakPasswordError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (new Set(password).size < 4) throw new WeakPasswordError('Password is too repetitive.');
  const local = email.split('@')[0];
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    throw new WeakPasswordError('Password must not contain your email address.');
  }
}
