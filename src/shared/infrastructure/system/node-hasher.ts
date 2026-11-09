import { createHash } from 'node:crypto';
import type { Hasher } from '../../application/request-hash';

export class NodeHasher implements Hasher {
  sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }
}
