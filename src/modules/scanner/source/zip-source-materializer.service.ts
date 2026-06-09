import { lstat } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import { SourceMaterializationError } from './source-materialization.error';
import { assertScannerNotAborted } from '../scanner-abort.util';

import type {
  MaterializedRepositorySource,
  MaterializeRepositorySourceInput,
  SourceMaterializer,
} from './source-materializer.interface';

@Injectable()
export class ZipSourceMaterializer implements SourceMaterializer {
  private readonly repositoryStoragePath: string;

  constructor(configService: ConfigService) {
    this.repositoryStoragePath = path.resolve(
      configService.getOrThrow<string>('repositories.storagePath'),
    );
  }

  supports(provider: RepositoryProvider): boolean {
    return provider === RepositoryProvider.ZIP;
  }

  async materialize(
    input: MaterializeRepositorySourceInput,
  ): Promise<MaterializedRepositorySource> {
    assertScannerNotAborted(input.abortSignal);

    if (!input.repository.sourcePath) {
      throw new SourceMaterializationError(
        'ZIP repository source is unavailable. Upload the ZIP repository again.',
      );
    }

    const sourcePath = this.resolveSourcePath(input.repository.sourcePath);
    const sourceStats = await lstat(sourcePath).catch(() => null);

    if (!sourceStats?.isDirectory()) {
      throw new SourceMaterializationError(
        'ZIP repository source is unavailable. Upload the ZIP repository again.',
      );
    }

    return {
      branch: null,
      cleanup: () => Promise.resolve(),
      commitSha: null,
      provider: input.repository.provider,
      sourcePath,
    };
  }

  private resolveSourcePath(sourcePath: string): string {
    const resolvedSourcePath = path.resolve(sourcePath);
    const allowedPrefix = `${this.repositoryStoragePath}${path.sep}`;

    if (!resolvedSourcePath.startsWith(allowedPrefix)) {
      throw new SourceMaterializationError('ZIP repository source path is invalid.');
    }

    return resolvedSourcePath;
  }
}
