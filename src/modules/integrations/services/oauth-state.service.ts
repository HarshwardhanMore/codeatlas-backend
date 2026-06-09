import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OAUTH_STATE_TTL_MS, type OAuthRepositoryProvider } from '../integrations.constants';

interface OAuthStatePayload {
  expiresAt: number;
  nonce: string;
  provider: OAuthRepositoryProvider;
  userId: string;
}

const HMAC_ALGORITHM = 'sha256';
const STATE_NONCE_BYTES = 16;
const STATE_PARTS = 2;

@Injectable()
export class OAuthStateService {
  private readonly signingSecret: string;

  constructor(configService: ConfigService) {
    this.signingSecret = configService.getOrThrow<string>('encryption.oauthEncryptionKey');
  }

  createState(userId: string, provider: OAuthRepositoryProvider): string {
    const payload: OAuthStatePayload = {
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      nonce: randomBytes(STATE_NONCE_BYTES).toString('base64url'),
      provider,
      userId,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  verifyState(state: string, expectedProvider: OAuthRepositoryProvider): OAuthStatePayload {
    const [encodedPayload, signature] = state.split('.');

    if (!encodedPayload || !signature || state.split('.').length !== STATE_PARTS) {
      throw new UnauthorizedException('OAuth state is invalid.');
    }

    const expectedSignature = this.sign(encodedPayload);

    if (!this.isEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('OAuth state signature is invalid.');
    }

    const payload = this.parsePayload(encodedPayload);

    if (payload.provider !== expectedProvider) {
      throw new UnauthorizedException('OAuth state provider mismatch.');
    }

    if (payload.expiresAt < Date.now()) {
      throw new UnauthorizedException('OAuth state has expired.');
    }

    return payload;
  }

  private sign(encodedPayload: string): string {
    return createHmac(HMAC_ALGORITHM, this.signingSecret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private isEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private parsePayload(encodedPayload: string): OAuthStatePayload {
    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as unknown;

      if (!this.isPayload(payload)) {
        throw new Error('Invalid OAuth state payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('OAuth state payload is invalid.');
    }
  }

  private isPayload(value: unknown): value is OAuthStatePayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;

    return (
      typeof record['expiresAt'] === 'number' &&
      typeof record['nonce'] === 'string' &&
      typeof record['provider'] === 'string' &&
      typeof record['userId'] === 'string'
    );
  }
}
