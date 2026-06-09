import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { RepositoryProvider } from '@prisma/client';

import { FileDiscoveryService } from './file-discovery.service';

import type { PreparedRepositoryWorkspace } from '../types/code-intelligence.types';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

function createRepository(sourcePath: string): Repository {
  return {
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
    provider: RepositoryProvider.ZIP,
    sourcePath,
    updatedAt: timestamp,
    uploadSizeBytes: null,
    url: 'file:///api.zip',
    visibility: 'private',
  };
}

function createWorkspace(sourcePath: string): PreparedRepositoryWorkspace {
  return {
    cleanup: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    repository: createRepository(sourcePath),
    rootPath: sourcePath,
    sourcePath,
  };
}

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn<number, [string]>((key) => {
      if (key === 'scanner.maxFileBytes') {
        return 1000;
      }

      if (key === 'scanner.maxFiles') {
        return 10;
      }

      return 0;
    }),
  } as unknown as ConfigService;
}

describe(FileDiscoveryService.name, () => {
  it('discovers supported source files and ignores generated directories', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-discovery-'));
    const sourcePath = await mkdir(path.join(rootPath, 'source'), { recursive: true });

    if (!sourcePath) {
      throw new Error('Source fixture directory was not created.');
    }

    try {
      await mkdir(path.join(sourcePath, 'src'), { recursive: true });
      await mkdir(path.join(sourcePath, 'node_modules'), { recursive: true });
      await writeFile(
        path.join(sourcePath, 'src', 'users.service.ts'),
        'export class UserService {}',
      );
      await writeFile(path.join(sourcePath, 'src', 'client.tsx'), 'export function Client() {}');
      await writeFile(path.join(sourcePath, 'README.md'), '# ignored');
      await writeFile(
        path.join(sourcePath, 'node_modules', 'ignored.ts'),
        'export const ignored = true;',
      );

      const service = new FileDiscoveryService(createConfigService());
      const result = await service.discover(createWorkspace(sourcePath));

      expect(result.files.map((file) => file.relativePath).sort()).toEqual([
        'src/client.tsx',
        'src/users.service.ts',
      ]);
      expect(result.ignoredFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'node_modules',
            reason: 'ignored-directory',
          }),
          expect.objectContaining({
            path: 'README.md',
            reason: 'unsupported-extension',
          }),
        ]),
      );
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });
});
