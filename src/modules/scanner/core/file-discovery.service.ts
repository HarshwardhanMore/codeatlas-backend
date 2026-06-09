import { opendir, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeLanguage } from '@prisma/client';

import { assertScannerNotAborted } from '../scanner-abort.util';
import { SCANNER_IGNORED_DIRECTORIES, SUPPORTED_CODE_EXTENSIONS } from '../scanner.constants';

import type {
  DiscoveredCodeFile,
  FileDiscoveryResult,
  IgnoredCodeFile,
  PreparedRepositoryWorkspace,
} from '../types/code-intelligence.types';

@Injectable()
export class FileDiscoveryService {
  private readonly maxFileBytes: number;
  private readonly maxFiles: number;

  constructor(configService: ConfigService) {
    this.maxFileBytes = configService.getOrThrow<number>('scanner.maxFileBytes');
    this.maxFiles = configService.getOrThrow<number>('scanner.maxFiles');
  }

  async discover(
    workspace: PreparedRepositoryWorkspace,
    abortSignal?: AbortSignal,
  ): Promise<FileDiscoveryResult> {
    const files: DiscoveredCodeFile[] = [];
    const ignoredFiles: IgnoredCodeFile[] = [];
    let totalVisitedFiles = 0;

    await this.walkDirectory(
      workspace.sourcePath,
      workspace.sourcePath,
      files,
      ignoredFiles,
      () => {
        totalVisitedFiles += 1;
      },
      abortSignal,
    );

    return {
      files,
      ignoredFiles,
      totalVisitedFiles,
    };
  }

  private async walkDirectory(
    rootPath: string,
    currentPath: string,
    files: DiscoveredCodeFile[],
    ignoredFiles: IgnoredCodeFile[],
    incrementVisitedFiles: () => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    assertScannerNotAborted(abortSignal);
    const directory = await opendir(currentPath);

    for await (const entry of directory) {
      assertScannerNotAborted(abortSignal);
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = this.toRelativePath(rootPath, absolutePath);

      if (entry.isDirectory()) {
        if (SCANNER_IGNORED_DIRECTORIES.has(entry.name)) {
          ignoredFiles.push({
            path: relativePath,
            reason: 'ignored-directory',
          });
          continue;
        }

        await this.walkDirectory(
          rootPath,
          absolutePath,
          files,
          ignoredFiles,
          incrementVisitedFiles,
          abortSignal,
        );
        continue;
      }

      if (!entry.isFile()) {
        ignoredFiles.push({
          path: relativePath,
          reason: 'unsupported-entry',
        });
        continue;
      }

      incrementVisitedFiles();

      if (files.length >= this.maxFiles) {
        ignoredFiles.push({
          path: relativePath,
          reason: 'max-files-exceeded',
        });
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (!SUPPORTED_CODE_EXTENSIONS.has(extension)) {
        ignoredFiles.push({
          path: relativePath,
          reason: 'unsupported-extension',
        });
        continue;
      }

      const fileStats = await stat(absolutePath);

      if (fileStats.size > this.maxFileBytes) {
        ignoredFiles.push({
          path: relativePath,
          reason: 'max-file-size-exceeded',
        });
        continue;
      }

      files.push({
        absolutePath,
        extension,
        language: this.detectLanguageFromExtension(extension),
        relativePath,
        sizeBytes: fileStats.size,
      });
    }
  }

  private detectLanguageFromExtension(extension: string): CodeLanguage {
    if (extension === '.ts' || extension === '.tsx') {
      return CodeLanguage.TYPESCRIPT;
    }

    if (extension === '.js' || extension === '.jsx') {
      return CodeLanguage.JAVASCRIPT;
    }

    return CodeLanguage.UNKNOWN;
  }

  private toRelativePath(rootPath: string, absolutePath: string): string {
    return path.relative(rootPath, absolutePath).split(path.sep).join('/');
  }
}
