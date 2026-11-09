/**
 * Application-level encryption for especially sensitive fields (EIN, owner
 * date of birth, SSN last 4) on top of storage encryption at rest.
 * Ciphertext is self-describing so keys can be rotated.
 */
export interface FieldEncryptor {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export const FIELD_ENCRYPTOR = Symbol('FieldEncryptor');
