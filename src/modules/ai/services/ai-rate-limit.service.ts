import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const WINDOW_SECONDS = 60;

@Injectable()
export class AiRateLimitService implements OnModuleDestroy {
  private readonly limitPerMinute: number;
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    this.limitPerMinute = configService.getOrThrow<number>('ai.rateLimitPerMinute');
    this.redis = new Redis(configService.getOrThrow<string>('services.redisUrl'), {
      maxRetriesPerRequest: null,
    });
  }

  async assertAllowed(userId: string): Promise<void> {
    const key = this.createWindowKey(userId);
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }

    if (count > this.limitPerMinute) {
      throw new HttpException('AI request rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private createWindowKey(userId: string): string {
    return `ai:rate-limit:${userId}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000)).toString()}`;
  }
}
