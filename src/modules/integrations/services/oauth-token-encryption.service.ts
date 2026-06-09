import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ENCRYPTION_VERSION = 'v1';
const AES_256_GCM_ALGORITHM = 'aes-256-gcm';
const AES_256_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const ENCRYPTED_TOKEN_PARTS = 4;

@Injectable()
export class OAuthTokenEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(configService: ConfigService) {
    const rawKey = configService.getOrThrow<string>('encryption.oauthEncryptionKey');
    this.encryptionKey = createHash('sha256')
      .update(rawKey)
      .digest()
      .subarray(0, AES_256_KEY_BYTES);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv(AES_256_GCM_ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTION_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split(':');

    if (parts.length !== ENCRYPTED_TOKEN_PARTS || parts[0] !== ENCRYPTION_VERSION) {
      throw new Error('Encrypted OAuth token format is invalid.');
    }

    const iv = Buffer.from(parts[1] ?? '', 'base64url');
    const authTag = Buffer.from(parts[2] ?? '', 'base64url');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, this.encryptionKey, iv);

    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
