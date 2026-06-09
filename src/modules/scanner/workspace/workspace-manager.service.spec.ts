import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { RepositoryProvider } from '@prisma/client';

import { WorkspaceManagerService } from './workspace-manager.service';

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

describe(WorkspaceManagerService.name, () => {
  it('creates an isolated copy and skips ignored directories and symlinks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-workspace-'));
    const sourcePath = path.join(tempRoot, 'source');
    const workspaceRoot = path.join(tempRoot, 'workspace');
    const configService = {
      getOrThrow: jest.fn<string | number, [string]>((key) => {
        if (key === 'scanner.workspacePath') {
          return workspaceRoot;
        }

        if (key === 'scanner.maxFileBytes') {
          return 1048576;
        }

        if (key === 'scanner.maxWorkspaceBytes') {
          return 262144000;
        }

        return '';
      }),
    } as unknown as ConfigService;

    try {
      await mkdir(path.join(sourcePath, 'src'), { recursive: true });
      await mkdir(path.join(sourcePath, 'node_modules'), { recursive: true });
      await writeFile(path.join(sourcePath, 'src', 'service.ts'), 'export class Service {}');
      await writeFile(
        path.join(sourcePath, 'node_modules', 'ignored.ts'),
        'export const ignored = true;',
      );
      await symlink(path.join(sourcePath, 'src', 'service.ts'), path.join(sourcePath, 'linked.ts'));

      const service = new WorkspaceManagerService(configService);
      const workspace = await service.prepareWorkspace(
        createRepository(sourcePath),
        'scan-id',
        sourcePath,
      );
      const workspaceStats = await lstat(workspace.rootPath);

      expect(workspaceStats.isDirectory()).toBe(true);
      expect(existsSync(path.join(workspace.sourcePath, 'src', 'service.ts'))).toBe(true);
      expect(existsSync(path.join(workspace.sourcePath, 'node_modules'))).toBe(false);
      expect(existsSync(path.join(workspace.sourcePath, 'linked.ts'))).toBe(false);

      await workspace.cleanup();
      expect(existsSync(workspace.rootPath)).toBe(false);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it('rejects repositories that exceed the configured workspace byte limit', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-workspace-limit-'));
    const sourcePath = path.join(tempRoot, 'source');
    const workspaceRoot = path.join(tempRoot, 'workspace');
    const configService = {
      getOrThrow: jest.fn<string | number, [string]>((key) => {
        const values: Record<string, number | string> = {
          'scanner.maxFileBytes': 1048576,
          'scanner.maxWorkspaceBytes': 10,
          'scanner.workspacePath': workspaceRoot,
        };

        return values[key] ?? '';
      }),
    } as unknown as ConfigService;

    try {
      await mkdir(path.join(sourcePath, 'src'), { recursive: true });
      await writeFile(path.join(sourcePath, 'src', 'service.ts'), 'export class Service {}');

      const service = new WorkspaceManagerService(configService);

      await expect(
        service.prepareWorkspace(createRepository(sourcePath), 'scan-id', sourcePath),
      ).rejects.toThrow('Repository workspace exceeds configured size limit.');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
