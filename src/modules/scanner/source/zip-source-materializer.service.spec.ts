import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { RepositoryProvider, type Repository } from '@prisma/client';

import { ZipSourceMaterializer } from './zip-source-materializer.service';

import type { ConfigService } from '@nestjs/config';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

function createConfigService(repositoryStoragePath: string): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): string => {
      const values: Record<string, string> = {
        'repositories.storagePath': repositoryStoragePath,
      };

      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
}

function createZipRepository(sourcePath: string | null): Repository {
  return {
    archivePath: sourcePath ? path.join(path.dirname(sourcePath), 'archive.zip') : null,
    connectionId: 'connection-id',
    createdAt: timestamp,
    defaultBranch: null,
    externalId: 'zip:repository-id',
    fullName: 'uploaded-api',
    id: 'repository-id',
    language: null,
    name: 'uploaded-api',
    ownerId: 'user-id',
    provider: RepositoryProvider.ZIP,
    sourcePath,
    updatedAt: timestamp,
    uploadSizeBytes: 100,
    url: 'zip://repository-id',
    visibility: 'private',
  };
}

describe(ZipSourceMaterializer.name, () => {
  it('materializes existing ZIP repository sources through the shared interface', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-zip-materializer-'));
    const sourcePath = path.join(tempRoot, 'repositories', 'user-id', 'repository-id', 'source');
    const service = new ZipSourceMaterializer(
      createConfigService(path.join(tempRoot, 'repositories')),
    );

    try {
      await mkdir(sourcePath, { recursive: true });

      const source = await service.materialize({
        repository: createZipRepository(sourcePath),
        scanId: 'scan-id',
        selectedBranch: null,
      });

      expect(source.branch).toBeNull();
      expect(source.commitSha).toBeNull();
      expect(source.provider).toBe(RepositoryProvider.ZIP);
      expect(source.sourcePath).toBe(sourcePath);
      await expect(source.cleanup()).resolves.toBeUndefined();
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it('rejects ZIP repository source paths outside configured storage', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-zip-invalid-'));
    const outsideSource = path.join(tempRoot, 'outside-source');
    const service = new ZipSourceMaterializer(
      createConfigService(path.join(tempRoot, 'repositories')),
    );

    try {
      await mkdir(outsideSource, { recursive: true });

      await expect(
        service.materialize({
          repository: createZipRepository(outsideSource),
          scanId: 'scan-id',
          selectedBranch: null,
        }),
      ).rejects.toThrow('ZIP repository source path is invalid.');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
