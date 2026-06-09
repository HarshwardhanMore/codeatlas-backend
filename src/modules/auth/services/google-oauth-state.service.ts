import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { GOOGLE_OAUTH_STATE_TTL_MS } from '../auth.constants';

interface GoogleOAuthStatePayload {
  expiresAt: number;
  nonce: string;
}

const HMAC_ALGORITHM = 'sha256';
const STATE_NONCE_BYTES = 16;
const STATE_PARTS = 2;
const STATE_REDIS_PREFIX = 'auth:google-oauth-state';

@Injectable()
export class GoogleOAuthStateService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly signingSecret: string;

  constructor(configService: ConfigService) {
    this.redis = new Redis(configService.getOrThrow<string>('services.redisUrl'), {
      maxRetriesPerRequest: null,
    });
    this.signingSecret = configService.getOrThrow<string>('encryption.oauthEncryptionKey');
  }

  async createState(): Promise<string> {
    const payload: GoogleOAuthStatePayload = {
      expiresAt: Date.now() + GOOGLE_OAUTH_STATE_TTL_MS,
      nonce: randomBytes(STATE_NONCE_BYTES).toString('base64url'),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const state = `${encodedPayload}.${this.sign(encodedPayload)}`;

    await this.redis.set(this.getStateKey(state), '1', 'PX', GOOGLE_OAUTH_STATE_TTL_MS, 'NX');

    return state;
  }

  async consumeState(
    state: string | undefined,
    cookieState: string | undefined,
  ): Promise<GoogleOAuthStatePayload> {
    if (!state || !cookieState) {
      throw new UnauthorizedException('Google OAuth state is required.');
    }

    if (!this.isEqual(state, cookieState)) {
      throw new UnauthorizedException('Google OAuth state cookie mismatch.');
    }

    const payload = this.verifyState(state);

    if (payload.expiresAt < Date.now()) {
      throw new UnauthorizedException('Google OAuth state has expired.');
    }

    const consumed = await this.redis.getdel(this.getStateKey(state));

    if (!consumed) {
      throw new UnauthorizedException('Google OAuth state has already been used.');
    }

    return payload;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private verifyState(state: string): GoogleOAuthStatePayload {
    const parts = state.split('.');
    const [encodedPayload, signature] = parts;

    if (parts.length !== STATE_PARTS || !encodedPayload || !signature) {
      throw new UnauthorizedException('Google OAuth state is invalid.');
    }

    if (!this.isEqual(signature, this.sign(encodedPayload))) {
      throw new UnauthorizedException('Google OAuth state signature is invalid.');
    }

    return this.parsePayload(encodedPayload);
  }

  private parsePayload(encodedPayload: string): GoogleOAuthStatePayload {
    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as unknown;

      if (!this.isPayload(payload)) {
        throw new Error('Invalid Google OAuth state payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Google OAuth state payload is invalid.');
    }
  }

  private isPayload(value: unknown): value is GoogleOAuthStatePayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;

    return typeof record['expiresAt'] === 'number' && typeof record['nonce'] === 'string';
  }

  private sign(encodedPayload: string): string {
    return createHmac(HMAC_ALGORITHM, this.signingSecret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private getStateKey(state: string): string {
    return `${STATE_REDIS_PREFIX}:${this.sign(state)}`;
  }

  private isEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
