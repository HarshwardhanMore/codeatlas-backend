import { Injectable, Logger } from '@nestjs/common';
import { ScanStatus } from '@prisma/client';

import { ScanProgressConsumer } from '../../jobs/consumers/scan-progress.consumer';
import { ApiIntelligenceEngineService } from '../api-intelligence/services/api-intelligence-engine.service';
import { CodeIntelligenceEngineService } from '../core/code-intelligence-engine.service';
import { ScansRepository } from '../repositories/scans.repository';
import {
  assertScannerNotAborted,
  isScannerAbortError,
  ScannerAbortError,
} from '../scanner-abort.util';
import { SCAN_PROGRESS_STAGES, TERMINAL_SCAN_STATUSES } from '../scanner.constants';
import { ScanCancelledError } from './scan-cancelled.error';
import { isSourceMaterializationError } from '../source/source-materialization.error';
import { SourceMaterializerRegistryService } from '../source/source-materializer-registry.service';
import { WorkspaceManagerService } from '../workspace/workspace-manager.service';

import type { ApiIntelligenceResult } from '../api-intelligence/types/api-intelligence.types';
import type {
  RepositoryScanJobPayload,
  ScanProgressReporter,
  ScanProgressSnapshot,
} from '../interfaces/repository-scan-job.interface';
import type { MaterializedRepositorySource } from '../source/source-materializer.interface';
import type {
  CodeIntelligenceProgressUpdate,
  CodeIntelligenceResult,
  PreparedRepositoryWorkspace,
} from '../types/code-intelligence.types';
import type { Prisma } from '@prisma/client';

const PUBLIC_SCAN_FAILURE_MESSAGE = 'Repository scan failed.';

@Injectable()
export class RepositoryScanLifecycleService {
  private readonly logger = new Logger(RepositoryScanLifecycleService.name);

  constructor(
    private readonly apiIntelligenceEngine: ApiIntelligenceEngineService,
    private readonly codeIntelligenceEngine: CodeIntelligenceEngineService,
    private readonly progressConsumer: ScanProgressConsumer,
    private readonly scansRepository: ScansRepository,
    private readonly sourceMaterializerRegistry: SourceMaterializerRegistryService,
    private readonly workspaceManager: WorkspaceManagerService,
  ) {}

  async runRepositoryScan(
    payload: RepositoryScanJobPayload,
    reportProgress: ScanProgressReporter,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    assertScannerNotAborted(abortSignal);
    await this.assertNotCancelled(payload.scanId);
    await this.scansRepository.markRunning(payload.scanId);
    await this.updateProgress(
      payload.scanId,
      10,
      SCAN_PROGRESS_STAGES.validatingRepository,
      reportProgress,
    );

    const repository = await this.scansRepository.findRepositoryForUser(
      payload.repositoryId,
      payload.userId,
    );

    if (!repository) {
      throw new Error('Repository was not found for scan owner.');
    }

    assertScannerNotAborted(abortSignal);
    await this.assertNotCancelled(payload.scanId);
    let materializedSource: MaterializedRepositorySource | null = null;
    let workspace: PreparedRepositoryWorkspace | null = null;

    try {
      await this.updateProgress(
        payload.scanId,
        15,
        SCAN_PROGRESS_STAGES.materializingSource,
        reportProgress,
        {
          source: {
            status: 'MATERIALIZING',
            type: repository.provider,
          },
        },
      );
      materializedSource = await this.sourceMaterializerRegistry.materialize({
        abortSignal,
        repository,
        scanId: payload.scanId,
        selectedBranch: repository.defaultBranch,
      });
      assertScannerNotAborted(abortSignal);
      await this.assertNotCancelled(payload.scanId);
      workspace = await this.workspaceManager.prepareWorkspace(
        repository,
        payload.scanId,
        materializedSource.sourcePath,
        abortSignal,
      );
      await this.updateProgress(
        payload.scanId,
        20,
        SCAN_PROGRESS_STAGES.preparingWorkspace,
        reportProgress,
        {
          source: this.toSourceMetadata(materializedSource, 'MATERIALIZED'),
          workspacePrepared: true,
        },
      );

      assertScannerNotAborted(abortSignal);
      await this.assertNotCancelled(payload.scanId);
      const result = await this.codeIntelligenceEngine.analyzeRepository({
        abortSignal,
        onProgress: async (update): Promise<void> => {
          await this.handleEngineProgress(payload.scanId, update, reportProgress);
        },
        scanId: payload.scanId,
        workspace,
      });

      assertScannerNotAborted(abortSignal);
      await this.assertNotCancelled(payload.scanId);
      const apiResult = await this.apiIntelligenceEngine.discoverApis({
        abortSignal,
        codeIntelligence: result,
        onProgress: async (update): Promise<void> => {
          await this.handleEngineProgress(payload.scanId, update, reportProgress);
        },
        scanId: payload.scanId,
        workspace,
      });

      assertScannerNotAborted(abortSignal);
      await this.assertNotCancelled(payload.scanId);
      await this.completeScan(
        payload.scanId,
        reportProgress,
        result,
        apiResult,
        materializedSource,
      );
    } finally {
      await this.cleanupScanResources(workspace, materializedSource);
    }
  }

  async failRepositoryScan(scanId: string, error: unknown): Promise<void> {
    const currentScan = await this.scansRepository.findScanById(scanId);

    if (!currentScan || this.isTerminalStatus(currentScan.status)) {
      return;
    }

    if (error instanceof ScanCancelledError) {
      await this.scansRepository.markCancelled(scanId);
      await this.progressConsumer.setProgress(scanId, {
        message: 'Repository scan was cancelled.',
        progress: currentScan.progress,
        stage: ScanStatus.CANCELLED,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const failureMessage =
      isSourceMaterializationError(error) || isScannerAbortError(error)
        ? error.message
        : PUBLIC_SCAN_FAILURE_MESSAGE;

    await this.scansRepository.markFailed(scanId, failureMessage);
    await this.progressConsumer.setProgress(scanId, {
      message: failureMessage,
      progress: currentScan.progress,
      stage: ScanStatus.FAILED,
      updatedAt: new Date().toISOString(),
    });
  }

  private async completeScan(
    scanId: string,
    reportProgress: ScanProgressReporter,
    result: CodeIntelligenceResult,
    apiResult: ApiIntelligenceResult,
    materializedSource: MaterializedRepositorySource,
  ): Promise<void> {
    const metadata = this.buildCompletionMetadata(result, apiResult, materializedSource);

    const completedScan = await this.scansRepository.markCompletedIfRunning(scanId, metadata);

    if (completedScan.status !== ScanStatus.COMPLETED) {
      throw new ScannerAbortError('Repository scan is no longer running.');
    }

    await this.updateProgress(scanId, 100, SCAN_PROGRESS_STAGES.completed, reportProgress);
  }

  private async handleEngineProgress(
    scanId: string,
    update: CodeIntelligenceProgressUpdate,
    reportProgress: ScanProgressReporter,
  ): Promise<void> {
    await this.assertNotCancelled(scanId);
    await this.updateProgress(
      scanId,
      update.progress,
      update.stage,
      reportProgress,
      update.metadata as Prisma.InputJsonValue,
    );
  }

  private buildCompletionMetadata(
    result: CodeIntelligenceResult,
    apiResult: ApiIntelligenceResult,
    materializedSource: MaterializedRepositorySource,
  ): Prisma.InputJsonValue {
    return {
      apis: {
        changesDetected: apiResult.changeCount,
        detected: apiResult.apis.length,
        documentationGenerated: apiResult.documentationCount,
        extractors: apiResult.extractorMetadata.map((metadata) => ({
          framework: metadata.framework,
          routeCount: metadata.routeCount,
          schemaCount: metadata.schemaCount,
        })),
        snapshotsCreated: apiResult.snapshotCount,
      },
      dependencies: {
        total: result.dependencies.length,
      },
      files: {
        analyzed: result.files.length,
        discovered: result.discovery.files.length,
        ignored: result.discovery.ignoredFiles.length,
        parseFailures: result.parseFailureCount,
        totalVisited: result.discovery.totalVisitedFiles,
      },
      frameworks: result.frameworks.map((framework) => ({
        confidence: framework.confidence,
        evidence: framework.evidence,
        framework: framework.framework,
      })),
      languages: {
        primaryLanguage: result.languages.primaryLanguage,
        stats: result.languages.stats.map((stat) => ({
          fileCount: stat.fileCount,
          language: stat.language,
          percentage: stat.percentage,
        })),
      },
      scannerVersion: 'phase7.5',
      source: this.toSourceMetadata(materializedSource, 'MATERIALIZED'),
    };
  }

  private toSourceMetadata(
    materializedSource: MaterializedRepositorySource,
    status: 'MATERIALIZED',
  ): Prisma.InputJsonValue {
    return {
      branch: materializedSource.branch,
      commitSha: materializedSource.commitSha,
      status,
      type: materializedSource.provider,
    };
  }

  private async cleanupScanResources(
    workspace: PreparedRepositoryWorkspace | null,
    materializedSource: MaterializedRepositorySource | null,
  ): Promise<void> {
    const cleanupResults = await Promise.allSettled([
      workspace?.cleanup() ?? Promise.resolve(),
      materializedSource?.cleanup() ?? Promise.resolve(),
    ]);

    for (const result of cleanupResults) {
      if (result.status === 'rejected') {
        this.logger.error(
          JSON.stringify({
            error: result.reason instanceof Error ? result.reason.message : 'Cleanup failed.',
            event: 'repository_scan_cleanup_failed',
          }),
        );
      }
    }
  }

  private async updateProgress(
    scanId: string,
    progress: number,
    stage: string,
    reportProgress: ScanProgressReporter,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const snapshot: ScanProgressSnapshot = {
      message: stage,
      progress,
      stage,
      updatedAt: new Date().toISOString(),
    };

    await this.scansRepository.updateProgress(scanId, {
      metadata,
      progress,
    });
    await this.progressConsumer.setProgress(scanId, snapshot);
    await reportProgress(snapshot);
  }

  private async assertNotCancelled(scanId: string): Promise<void> {
    const scan = await this.scansRepository.findScanById(scanId);

    if (scan?.status === ScanStatus.CANCELLED) {
      throw new ScanCancelledError(scanId);
    }
  }

  private isTerminalStatus(status: ScanStatus): boolean {
    return TERMINAL_SCAN_STATUSES.includes(status);
  }
}
