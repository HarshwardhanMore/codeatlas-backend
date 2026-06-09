import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { ScanProgressSnapshot } from '../../scanner/interfaces/repository-scan-job.interface';

const SCAN_PROGRESS_KEY_PREFIX = 'scan';
const SCAN_PROGRESS_KEY_SUFFIX = 'progress';

@Injectable()
export class ScanProgressConsumer implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(configService: ConfigService) {
    this.redis = new Redis(configService.getOrThrow<string>('services.redisUrl'), {
      maxRetriesPerRequest: null,
    });
    this.ttlSeconds = configService.getOrThrow<number>('scanner.progressTtlSeconds');
  }

  async setProgress(scanId: string, progress: ScanProgressSnapshot): Promise<void> {
    await this.redis.set(
      this.getProgressKey(scanId),
      JSON.stringify(progress),
      'EX',
      this.ttlSeconds,
    );
  }

  async getProgress(scanId: string): Promise<ScanProgressSnapshot | null> {
    const value = await this.redis.get(this.getProgressKey(scanId));

    if (!value) {
      return null;
    }

    return this.parseProgress(value);
  }

  async deleteProgress(scanId: string): Promise<void> {
    await this.redis.del(this.getProgressKey(scanId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private getProgressKey(scanId: string): string {
    return `${SCAN_PROGRESS_KEY_PREFIX}:${scanId}:${SCAN_PROGRESS_KEY_SUFFIX}`;
  }

  private parseProgress(value: string): ScanProgressSnapshot | null {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (!this.isProgressSnapshot(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private isProgressSnapshot(value: unknown): value is ScanProgressSnapshot {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;

    return (
      typeof record['message'] === 'string' &&
      typeof record['progress'] === 'number' &&
      typeof record['stage'] === 'string' &&
      typeof record['updatedAt'] === 'string'
    );
  }
}
