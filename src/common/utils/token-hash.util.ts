import { createHash } from 'node:crypto';

const TOKEN_HASH_ALGORITHM = 'sha256';
const TOKEN_DIGEST_ENCODING = 'hex';

export function hashToken(token: string): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(token).digest(TOKEN_DIGEST_ENCODING);
}
