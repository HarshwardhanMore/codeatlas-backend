import { copyFile, lstat, mkdir, opendir, rm } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { assertScannerNotAborted } from '../scanner-abort.util';
import {
  SCANNER_IGNORED_DIRECTORIES,
  SCANNER_WORKSPACE_DIRECTORY_MODE,
  SUPPORTED_CODE_EXTENSIONS,
} from '../scanner.constants';

import type { PreparedRepositoryWorkspace } from '../types/code-intelligence.types';
import type { Repository } from '@prisma/client';

@Injectable()
export class WorkspaceManagerService {
  private readonly maxFileBytes: number;
  private readonly maxWorkspaceBytes: number;
  private readonly workspaceRoot: string;

  constructor(configService: ConfigService) {
    this.maxFileBytes = configService.getOrThrow<number>('scanner.maxFileBytes');
    this.maxWorkspaceBytes = configService.getOrThrow<number>('scanner.maxWorkspaceBytes');
    this.workspaceRoot = path.resolve(configService.getOrThrow<string>('scanner.workspacePath'));
  }

  async prepareWorkspace(
    repository: Repository,
    scanId: string,
    materializedSourcePath: string,
    abortSignal?: AbortSignal,
  ): Promise<PreparedRepositoryWorkspace> {
    assertScannerNotAborted(abortSignal);
    const sourcePath = path.resolve(materializedSourcePath);
    const sourceStats = await lstat(sourcePath);

    if (!sourceStats.isDirectory()) {
      throw new Error('Repository source path is not a directory.');
    }

    const rootPath = path.resolve(this.workspaceRoot, scanId);
    const workspaceSourcePath = path.resolve(rootPath, 'source');

    await rm(rootPath, { force: true, recursive: true });
    await mkdir(workspaceSourcePath, {
      mode: SCANNER_WORKSPACE_DIRECTORY_MODE,
      recursive: true,
    });
    await this.copyDirectory(sourcePath, workspaceSourcePath, { copiedBytes: 0 }, abortSignal);

    return {
      cleanup: async (): Promise<void> => {
        await rm(rootPath, { force: true, recursive: true });
      },
      repository,
      rootPath,
      sourcePath: workspaceSourcePath,
    };
  }

  private async copyDirectory(
    sourceDirectory: string,
    targetDirectory: string,
    state: { copiedBytes: number },
    abortSignal?: AbortSignal,
  ): Promise<void> {
    assertScannerNotAborted(abortSignal);
    await mkdir(targetDirectory, {
      mode: SCANNER_WORKSPACE_DIRECTORY_MODE,
      recursive: true,
    });

    const directory = await opendir(sourceDirectory);

    for await (const entry of directory) {
      assertScannerNotAborted(abortSignal);

      if (entry.isDirectory() && SCANNER_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const sourcePath = path.join(sourceDirectory, entry.name);
      const targetPath = path.join(targetDirectory, entry.name);
      const stats = await lstat(sourcePath);

      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath, state, abortSignal);
        continue;
      }

      if (stats.isFile() && this.shouldCopyFile(entry.name, stats.size)) {
        this.incrementCopiedBytes(state, stats.size);
        await copyFile(sourcePath, targetPath);
      }
    }
  }

  private shouldCopyFile(fileName: string, sizeBytes: number): boolean {
    if (sizeBytes > this.maxFileBytes) {
      return false;
    }

    if (SCANNER_METADATA_FILES.has(fileName)) {
      return true;
    }

    return SUPPORTED_CODE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
  }

  private incrementCopiedBytes(state: { copiedBytes: number }, fileSizeBytes: number): void {
    const nextCopiedBytes = state.copiedBytes + fileSizeBytes;

    if (nextCopiedBytes > this.maxWorkspaceBytes) {
      throw new Error('Repository workspace exceeds configured size limit.');
    }

    state.copiedBytes = nextCopiedBytes;
  }
}

const SCANNER_METADATA_FILES = new Set(['jsconfig.json', 'package.json', 'tsconfig.json']);
