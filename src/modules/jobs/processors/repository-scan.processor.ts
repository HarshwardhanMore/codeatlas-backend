import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScanStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';

import { RepositoryScanLifecycleService } from '../../scanner/lifecycle/repository-scan-lifecycle.service';
import { ScannerAbortError } from '../../scanner/scanner-abort.util';
import { QueueRegistryService } from '../queues/queue-registry.service';
import { QUEUE_NAMES } from '../queues/queue.constants';

import type {
  RepositoryScanJobName,
  RepositoryScanJobPayload,
  RepositoryScanJobResult,
} from '../../scanner/interfaces/repository-scan-job.interface';

@Injectable()
export class RepositoryScanProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RepositoryScanProcessor.name);
  private worker: Worker<
    RepositoryScanJobPayload,
    RepositoryScanJobResult,
    RepositoryScanJobName
  > | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly lifecycleService: RepositoryScanLifecycleService,
    private readonly queueRegistryService: QueueRegistryService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<
      RepositoryScanJobPayload,
      RepositoryScanJobResult,
      RepositoryScanJobName
    >(QUEUE_NAMES.repositoryScan, (job) => this.process(job), {
      connection: this.queueRegistryService.createConnectionOptions(),
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        JSON.stringify({
          error: error.message,
          event: 'repository_scan_job_failed',
          scanId: job?.data.scanId ?? null,
        }),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(
    job: Job<RepositoryScanJobPayload, RepositoryScanJobResult, RepositoryScanJobName>,
  ): Promise<RepositoryScanJobResult> {
    const startedAt = Date.now();
    const { repositoryId, scanId, userId } = job.data;

    this.logger.log(
      JSON.stringify({
        event: 'repository_scan_job_started',
        repositoryId,
        scanId,
        userId,
      }),
    );

    try {
      await this.withTimeout((abortSignal) =>
        this.lifecycleService.runRepositoryScan(
          job.data,
          async (progress) => {
            await job.updateProgress(progress.progress);
          },
          abortSignal,
        ),
      );

      this.logger.log(
        JSON.stringify({
          durationMs: Date.now() - startedAt,
          event: 'repository_scan_job_completed',
          repositoryId,
          scanId,
          userId,
        }),
      );

      return {
        scanId,
        status: ScanStatus.COMPLETED,
      };
    } catch (error) {
      await this.lifecycleService.failRepositoryScan(scanId, error);
      this.logger.error(
        JSON.stringify({
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'Unknown scan failure.',
          event: 'repository_scan_job_failed',
          repositoryId,
          scanId,
          userId,
        }),
      );
      throw error;
    }
  }

  private async withTimeout<T>(operation: (abortSignal: AbortSignal) => Promise<T>): Promise<T> {
    const timeoutMs = this.configService.getOrThrow<number>('scanner.jobTimeoutMs');
    const abortController = new AbortController();
    let rejectTimeout: (reason?: unknown) => void = () => undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      const error = new ScannerAbortError('Repository scan timed out.');
      abortController.abort(error);
      rejectTimeout(error);
    }, timeoutMs);

    try {
      return await Promise.race([operation(abortController.signal), timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
