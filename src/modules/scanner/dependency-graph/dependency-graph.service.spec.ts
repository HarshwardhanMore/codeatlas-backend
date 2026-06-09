import { NotFoundException } from '@nestjs/common';
import {
  CodeDependencyKind,
  CodeLanguage,
  RepositoryProvider,
  ScanStatus,
  UserStatus,
} from '@prisma/client';

import { DependencyGraphService } from './dependency-graph.service';

import type {
  CodeDependencyWithFiles,
  DependencyGraphRepository,
} from './dependency-graph.repository';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Repository, ScanJob } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const user: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['USER'],
  status: UserStatus.ACTIVE,
};

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
  ownerId: user.id,
  provider: RepositoryProvider.GITHUB,
  sourcePath: null,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'https://github.com/owner/api',
  visibility: 'private',
};

const scan: ScanJob = {
  createdAt: timestamp,
  errorMessage: null,
  finishedAt: timestamp,
  id: 'scan-id',
  metadata: null,
  progress: 100,
  repositoryId: repository.id,
  startedAt: timestamp,
  status: ScanStatus.COMPLETED,
  updatedAt: timestamp,
};

function createContext(): {
  repository: jest.Mocked<
    Pick<
      DependencyGraphRepository,
      'findLatestCompletedScan' | 'findRepositoryForUser' | 'listDependenciesForScan'
    >
  >;
  service: DependencyGraphService;
} {
  const dependencyGraphRepository = {
    findLatestCompletedScan: jest.fn(),
    findRepositoryForUser: jest.fn(),
    listDependenciesForScan: jest.fn(),
  };

  return {
    repository: dependencyGraphRepository,
    service: new DependencyGraphService(
      dependencyGraphRepository as unknown as DependencyGraphRepository,
    ),
  };
}

describe(DependencyGraphService.name, () => {
  it('returns nodes and edges from persisted dependency records', async () => {
    const context = createContext();
    const dependency: CodeDependencyWithFiles = {
      createdAt: timestamp,
      id: 'dependency-id',
      kind: CodeDependencyKind.IMPORT,
      metadata: null,
      repositoryId: repository.id,
      scanId: scan.id,
      sourceFile: {
        id: 'source-file-id',
        language: CodeLanguage.TYPESCRIPT,
        path: 'src/auth/auth.service.ts',
      },
      sourceFileId: 'source-file-id',
      sourcePath: 'src/auth/auth.service.ts',
      specifier: './token.service',
      targetFile: {
        id: 'target-file-id',
        language: CodeLanguage.TYPESCRIPT,
        path: 'src/auth/token.service.ts',
      },
      targetFileId: 'target-file-id',
      targetPath: 'src/auth/token.service.ts',
      updatedAt: timestamp,
    };

    jest.mocked(context.repository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.repository.findLatestCompletedScan).mockResolvedValue(scan);
    jest.mocked(context.repository.listDependenciesForScan).mockResolvedValue([dependency]);

    const graph = await context.service.getRepositoryDependencyGraph(user, repository.id);

    expect(graph.scanId).toBe(scan.id);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-file-id',
          type: 'FILE',
        }),
        expect.objectContaining({
          id: 'target-file-id',
          type: 'FILE',
        }),
      ]),
    );
    expect(graph.edges).toEqual([
      {
        id: dependency.id,
        kind: CodeDependencyKind.IMPORT,
        source: 'source-file-id',
        specifier: './token.service',
        target: 'target-file-id',
      },
    ]);
  });

  it('rejects repositories outside the current user boundary', async () => {
    const context = createContext();

    jest.mocked(context.repository.findRepositoryForUser).mockResolvedValue(null);

    await expect(
      context.service.getRepositoryDependencyGraph(user, repository.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
