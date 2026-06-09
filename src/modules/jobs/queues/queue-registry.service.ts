import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import {
  DEFAULT_BACKOFF_DELAY_MS,
  DEFAULT_REMOVE_ON_COMPLETE,
  DEFAULT_REMOVE_ON_FAIL,
  QUEUE_NAMES,
  type QueueName,
} from './queue.constants';

import type { DefaultJobOptions, RedisOptions } from 'bullmq';

@Injectable()
export class QueueRegistryService implements OnModuleDestroy {
  private readonly queues: ReadonlyMap<QueueName, Queue>;

  constructor(private readonly configService: ConfigService) {
    this.queues = new Map<QueueName, Queue>(
      Object.values(QUEUE_NAMES).map((queueName) => [queueName, this.createQueue(queueName)]),
    );
  }

  getQueue<TData, TResult = void, TName extends string = string>(
    queueName: QueueName,
  ): Queue<TData, TResult, TName> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} is not registered.`);
    }

    return queue as Queue<TData, TResult, TName>;
  }

  createConnectionOptions(): RedisOptions {
    return {
      maxRetriesPerRequest: null,
      url: this.configService.getOrThrow<string>('services.redisUrl'),
    };
  }

  getDefaultJobOptions(): DefaultJobOptions {
    return {
      attempts: this.configService.getOrThrow<number>('scanner.jobAttempts'),
      backoff: {
        delay: DEFAULT_BACKOFF_DELAY_MS,
        type: 'exponential',
      },
      removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
      removeOnFail: DEFAULT_REMOVE_ON_FAIL,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private createQueue(queueName: QueueName): Queue {
    return new Queue(queueName, {
      connection: this.createConnectionOptions(),
      defaultJobOptions: this.getDefaultJobOptions(),
    });
  }
}
