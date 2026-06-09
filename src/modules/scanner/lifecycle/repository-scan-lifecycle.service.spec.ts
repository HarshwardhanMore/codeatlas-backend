import { CodeLanguage, RepositoryProvider, ScanStatus } from '@prisma/client';

import { RepositoryScanLifecycleService } from './repository-scan-lifecycle.service';

import type { ScanProgressConsumer } from '../../jobs/consumers/scan-progress.consumer';
import type { ApiIntelligenceEngineService } from '../api-intelligence/services/api-intelligence-engine.service';
import type { ApiIntelligenceResult } from '../api-intelligence/types/api-intelligence.types';
import type { CodeIntelligenceEngineService } from '../core/code-intelligence-engine.service';
import type { ScansRepository } from '../repositories/scans.repository';
import type { SourceMaterializerRegistryService } from '../source/source-materializer-registry.service';
import type {
  CodeIntelligenceResult,
  PreparedRepositoryWorkspace,
} from '../types/code-intelligence.types';
import type { WorkspaceManagerService } from '../workspace/workspace-manager.service';
import type { Repository, ScanJob } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const repository: Repository = {
  archivePath: null,
  connectionId: 'connection-id',
  createdAt: timestamp,
  defaultBranch: 'main',
  externalId: 'external-id',
  fullName: 'owner/api',
  id: 'repository-id',
  language: 'TypeScript',
  name: 'api',
  ownerId: 'user-id',
  provider: RepositoryProvider.GITHUB,
  sourcePath: '/workspace/source',
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'https://github.com/owner/api',
  visibility: 'private',
};

const scan: ScanJob = {
  createdAt: timestamp,
  errorMessage: null,
  finishedAt: null,
  id: 'scan-id',
  metadata: null,
  progress: 0,
  repositoryId: repository.id,
  startedAt: null,
  status: ScanStatus.QUEUED,
  updatedAt: timestamp,
};

const cleanupWorkspace = jest.fn<Promise<void>, []>(() => Promise.resolve());

const workspace: PreparedRepositoryWorkspace = {
  cleanup: cleanupWorkspace,
  repository,
  rootPath: '/workspace/scan-id',
  sourcePath: '/workspace/scan-id/source',
};

const cleanupMaterializedSource = jest.fn<Promise<void>, []>(() => Promise.resolve());

const materializedSource = {
  branch: 'main',
  cleanup: cleanupMaterializedSource,
  commitSha: 'abc123abc123abc123abc123abc123abc123abcd',
  provider: RepositoryProvider.GITHUB,
  sourcePath: '/materialized/source',
};

const scanResult: CodeIntelligenceResult = {
  dependencies: [],
  discovery: {
    files: [],
    ignoredFiles: [],
    totalVisitedFiles: 0,
  },
  files: [],
  frameworks: [],
  languages: {
    primaryLanguage: CodeLanguage.UNKNOWN,
    stats: [],
  },
  parseFailureCount: 0,
};

const apiResult: ApiIntelligenceResult = {
  apis: [],
  changeCount: 0,
  documentationCount: 0,
  extractorMetadata: [],
  snapshotCount: 0,
};

interface LifecycleTestContext {
  apiIntelligenceEngine: jest.Mocked<Pick<ApiIntelligenceEngineService, 'discoverApis'>>;
  codeIntelligenceEngine: jest.Mocked<Pick<CodeIntelligenceEngineService, 'analyzeRepository'>>;
  progressConsumer: jest.Mocked<Pick<ScanProgressConsumer, 'setProgress'>>;
  scansRepository: jest.Mocked<
    Pick<
      ScansRepository,
      | 'findRepositoryForUser'
      | 'findScanById'
      | 'markCompleted'
      | 'markCompletedIfRunning'
      | 'markRunning'
      | 'updateProgress'
    >
  >;
  service: RepositoryScanLifecycleService;
  sourceMaterializerRegistry: jest.Mocked<Pick<SourceMaterializerRegistryService, 'materialize'>>;
  workspaceManager: jest.Mocked<Pick<WorkspaceManagerService, 'prepareWorkspace'>>;
}

function createContext(): LifecycleTestContext {
  const apiIntelligenceEngine: LifecycleTestContext['apiIntelligenceEngine'] = {
    discoverApis: jest.fn(),
  };
  const codeIntelligenceEngine: LifecycleTestContext['codeIntelligenceEngine'] = {
    analyzeRepository: jest.fn(),
  };
  const progressConsumer: LifecycleTestContext['progressConsumer'] = {
    setProgress: jest.fn(),
  };
  const scansRepository: LifecycleTestContext['scansRepository'] = {
    findRepositoryForUser: jest.fn(),
    findScanById: jest.fn(),
    markCompleted: jest.fn(),
    markCompletedIfRunning: jest.fn(),
    markRunning: jest.fn(),
    updateProgress: jest.fn(),
  };
  const workspaceManager: LifecycleTestContext['workspaceManager'] = {
    prepareWorkspace: jest.fn(),
  };
  const sourceMaterializerRegistry: LifecycleTestContext['sourceMaterializerRegistry'] = {
    materialize: jest.fn(),
  };

  return {
    apiIntelligenceEngine,
    codeIntelligenceEngine,
    progressConsumer,
    scansRepository,
    service: new RepositoryScanLifecycleService(
      apiIntelligenceEngine as unknown as ApiIntelligenceEngineService,
      codeIntelligenceEngine as unknown as CodeIntelligenceEngineService,
      progressConsumer as unknown as ScanProgressConsumer,
      scansRepository as unknown as ScansRepository,
      sourceMaterializerRegistry as unknown as SourceMaterializerRegistryService,
      workspaceManager as unknown as WorkspaceManagerService,
    ),
    sourceMaterializerRegistry,
    workspaceManager,
  };
}

describe(RepositoryScanLifecycleService.name, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs repository code intelligence and completes the scan', async () => {
    const context = createContext();
    const reportedProgress = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());
    jest.mocked(context.scansRepository.findScanById).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.markRunning).mockResolvedValue({
      ...scan,
      status: ScanStatus.RUNNING,
    });
    jest.mocked(context.scansRepository.updateProgress).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.markCompletedIfRunning).mockResolvedValue({
      ...scan,
      progress: 100,
      status: ScanStatus.COMPLETED,
    });
    jest
      .mocked(context.sourceMaterializerRegistry.materialize)
      .mockResolvedValue(materializedSource);
    jest.mocked(context.workspaceManager.prepareWorkspace).mockResolvedValue(workspace);
    jest
      .mocked(context.codeIntelligenceEngine.analyzeRepository)
      .mockImplementation(async (input) => {
        await input.onProgress({
          metadata: {
            discoveredFileCount: 0,
          },
          progress: 30,
          stage: 'Discovering source files',
        });

        return scanResult;
      });
    jest.mocked(context.apiIntelligenceEngine.discoverApis).mockImplementation(async (input) => {
      await input.onProgress({
        metadata: {
          apiCount: 0,
        },
        progress: 75,
        stage: 'Discovering API routes',
      });

      return apiResult;
    });

    await context.service.runRepositoryScan(
      {
        repositoryId: repository.id,
        scanId: scan.id,
        userId: repository.ownerId,
      },
      reportedProgress,
    );

    expect(context.sourceMaterializerRegistry.materialize).toHaveBeenCalledWith({
      repository,
      abortSignal: undefined,
      scanId: scan.id,
      selectedBranch: repository.defaultBranch,
    });
    expect(context.workspaceManager.prepareWorkspace).toHaveBeenCalledWith(
      repository,
      scan.id,
      materializedSource.sourcePath,
      undefined,
    );
    expect(context.codeIntelligenceEngine.analyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        scanId: scan.id,
        workspace,
      }),
    );
    expect(context.apiIntelligenceEngine.discoverApis).toHaveBeenCalledWith(
      expect.objectContaining({
        codeIntelligence: scanResult,
        scanId: scan.id,
        workspace,
      }),
    );
    expect(context.scansRepository.markRunning).toHaveBeenCalledWith(scan.id);
    expect(context.scansRepository.markCompletedIfRunning).toHaveBeenCalledWith(
      scan.id,
      expect.objectContaining({
        scannerVersion: 'phase7.5',
        source: {
          branch: materializedSource.branch,
          commitSha: materializedSource.commitSha,
          status: 'MATERIALIZED',
          type: RepositoryProvider.GITHUB,
        },
      }),
    );
    expect(cleanupWorkspace).toHaveBeenCalled();
    expect(cleanupMaterializedSource).toHaveBeenCalled();
    expect(context.progressConsumer.setProgress).toHaveBeenCalled();
  });

  it('does not fail a completed scan when workspace cleanup fails', async () => {
    const context = createContext();
    const reportedProgress = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());
    jest.mocked(context.scansRepository.findScanById).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.markRunning).mockResolvedValue({
      ...scan,
      status: ScanStatus.RUNNING,
    });
    jest.mocked(context.scansRepository.updateProgress).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.markCompletedIfRunning).mockResolvedValue({
      ...scan,
      progress: 100,
      status: ScanStatus.COMPLETED,
    });
    jest
      .mocked(context.sourceMaterializerRegistry.materialize)
      .mockResolvedValue(materializedSource);
    jest.mocked(context.workspaceManager.prepareWorkspace).mockResolvedValue(workspace);
    jest.mocked(context.codeIntelligenceEngine.analyzeRepository).mockResolvedValue(scanResult);
    jest.mocked(context.apiIntelligenceEngine.discoverApis).mockResolvedValue(apiResult);
    cleanupWorkspace.mockRejectedValueOnce(new Error('cleanup permission denied'));

    await expect(
      context.service.runRepositoryScan(
        {
          repositoryId: repository.id,
          scanId: scan.id,
          userId: repository.ownerId,
        },
        reportedProgress,
      ),
    ).resolves.toBeUndefined();

    expect(context.scansRepository.markCompletedIfRunning).toHaveBeenCalled();
    expect(cleanupWorkspace).toHaveBeenCalled();
    expect(cleanupMaterializedSource).toHaveBeenCalled();
  });

  it('passes abort signals to materialization, workspace, and scanner engines', async () => {
    const context = createContext();
    const reportedProgress = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());
    const abortController = new AbortController();
    jest.mocked(context.scansRepository.findScanById).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.markRunning).mockResolvedValue({
      ...scan,
      status: ScanStatus.RUNNING,
    });
    jest.mocked(context.scansRepository.updateProgress).mockResolvedValue(scan);
    jest.mocked(context.scansRepository.markCompletedIfRunning).mockResolvedValue({
      ...scan,
      progress: 100,
      status: ScanStatus.COMPLETED,
    });
    jest
      .mocked(context.sourceMaterializerRegistry.materialize)
      .mockResolvedValue(materializedSource);
    jest.mocked(context.workspaceManager.prepareWorkspace).mockResolvedValue(workspace);
    jest.mocked(context.codeIntelligenceEngine.analyzeRepository).mockResolvedValue(scanResult);
    jest.mocked(context.apiIntelligenceEngine.discoverApis).mockResolvedValue(apiResult);

    await context.service.runRepositoryScan(
      {
        repositoryId: repository.id,
        scanId: scan.id,
        userId: repository.ownerId,
      },
      reportedProgress,
      abortController.signal,
    );

    expect(context.sourceMaterializerRegistry.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
    );
    expect(context.workspaceManager.prepareWorkspace).toHaveBeenCalledWith(
      repository,
      scan.id,
      materializedSource.sourcePath,
      abortController.signal,
    );
    expect(context.codeIntelligenceEngine.analyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
    );
    expect(context.apiIntelligenceEngine.discoverApis).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
      }),
    );
  });
});
