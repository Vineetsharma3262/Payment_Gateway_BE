import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { FieldEncryptor } from '../../shared/application/field-encryption.port';

/** Format: `v1:{keyId}:{iv b64}:{tag b64}:{ciphertext b64}` (AES-256-GCM). */
export class AesGcmFieldEncryptor implements FieldEncryptor {
  private readonly keys: Map<string, Buffer>;

  constructor(
    private readonly activeKeyId: string,
    keys: Record<string, string>,
  ) {
    this.keys = new Map(Object.entries(keys).map(([id, b64]) => [id, Buffer.from(b64, 'base64')]));
    for (const [id, key] of this.keys) {
      if (key.length !== 32) throw new Error(`Field encryption key '${id}' must be 32 bytes.`);
    }
    if (!this.keys.has(activeKeyId)) throw new Error('Active field encryption key is missing.');
  }

  encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKeyId)!, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Promise.resolve(
      [
        'v1',
        this.activeKeyId,
        iv.toString('base64'),
        tag.toString('base64'),
        data.toString('base64'),
      ].join(':'),
    );
  }

  decrypt(ciphertext: string): Promise<string> {
    try {
      return Promise.resolve(this.decryptSync(ciphertext));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Decryption failed.'));
    }
  }

  /** Throws on unknown key, malformed input or authentication-tag mismatch (tampering). */
  private decryptSync(ciphertext: string): string {
    const [version, keyId, iv, tag, data] = ciphertext.split(':');
    const key = this.keys.get(keyId);
    if (version !== 'v1' || !key || !iv || !tag || data === undefined)
      throw new Error('Unrecognised ciphertext.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }
}
