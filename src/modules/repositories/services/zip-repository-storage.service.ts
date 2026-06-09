import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as yauzl from 'yauzl';

import {
  ALLOWED_ZIP_MIME_TYPES,
  MAX_SAFE_UPLOAD_NAME_LENGTH,
  ZIP_EXTERNAL_ID_PREFIX,
  ZIP_URL_SCHEME,
} from '../repositories.constants';

export interface StoreZipRepositoryInput {
  file: Express.Multer.File | undefined;
  repositoryId: string;
  userId: string;
}

export interface StoredZipRepositorySource {
  archivePath: string;
  externalId: string;
  fullName: string;
  name: string;
  sourcePath: string;
  uploadSizeBytes: number;
  url: string;
}

const ZIP_DIRECTORY_MODE = 0o755;
const ZIP_FILE_MODE = 0o600;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMLINK_TYPE = 0o120000;
const MAX_ZIP_ENTRY_COUNT = 20_000;
const ZIP_MAX_EXPANSION_FACTOR = 4;

@Injectable()
export class ZipRepositoryStorageService {
  private readonly maxZipUploadBytes: number;
  private readonly storagePath: string;

  constructor(configService: ConfigService) {
    this.maxZipUploadBytes = configService.getOrThrow<number>('repositories.maxZipUploadBytes');
    this.storagePath = path.resolve(configService.getOrThrow<string>('repositories.storagePath'));
  }

  async storeZipRepository(input: StoreZipRepositoryInput): Promise<StoredZipRepositorySource> {
    const file = this.validateZipFile(input.file);
    const repositoryName = this.getRepositoryName(file.originalname);
    const repositoryRoot = path.resolve(this.storagePath, input.userId, input.repositoryId);
    const sourcePath = path.join(repositoryRoot, 'source');
    const archivePath = path.join(repositoryRoot, `${repositoryName}.zip`);

    try {
      await rm(repositoryRoot, { force: true, recursive: true });
      await mkdir(sourcePath, { mode: ZIP_DIRECTORY_MODE, recursive: true });
      await writeFile(archivePath, file.buffer, { mode: ZIP_FILE_MODE });
      await this.extractArchive(file.buffer, sourcePath);
    } catch (error) {
      await rm(repositoryRoot, { force: true, recursive: true });
      throw error;
    }

    return {
      archivePath,
      externalId: `${ZIP_EXTERNAL_ID_PREFIX}:${input.repositoryId}`,
      fullName: repositoryName,
      name: repositoryName,
      sourcePath,
      uploadSizeBytes: file.size,
      url: `${ZIP_URL_SCHEME}://${input.repositoryId}`,
    };
  }

  async removeStoredRepository(userId: string, repositoryId: string): Promise<void> {
    const repositoryRoot = path.resolve(this.storagePath, userId, repositoryId);

    await rm(repositoryRoot, { force: true, recursive: true });
  }

  private validateZipFile(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('ZIP file is required.');
    }

    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only .zip repository uploads are supported.');
    }

    if (file.mimetype && !ALLOWED_ZIP_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Uploaded repository must be a ZIP archive.');
    }

    if (file.size <= 0 || file.buffer.length <= 0) {
      throw new BadRequestException('Uploaded ZIP archive is empty.');
    }

    if (file.size > this.maxZipUploadBytes) {
      throw new BadRequestException('Uploaded ZIP archive exceeds the configured size limit.');
    }

    return file;
  }

  private async extractArchive(buffer: Buffer, targetDirectory: string): Promise<void> {
    const resolvedTargetDirectory = path.resolve(targetDirectory);

    await new Promise<void>((resolve, reject) => {
      let zipFileReference: yauzl.ZipFile | null = null;
      let settled = false;
      let entryCount = 0;
      let totalUncompressedBytes = 0;

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        zipFileReference?.close();
        reject(error);
      };

      const succeed = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      yauzl.fromBuffer(
        buffer,
        { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
        (error, zipFile) => {
          if (error) {
            fail(this.toExtractionError(error));
            return;
          }

          zipFileReference = zipFile;
          zipFile.on('entry', (entry: yauzl.Entry) => {
            entryCount += 1;
            totalUncompressedBytes += entry.uncompressedSize;

            if (entryCount > MAX_ZIP_ENTRY_COUNT) {
              fail(new BadRequestException('ZIP archive contains too many entries.'));
              return;
            }

            if (totalUncompressedBytes > this.maxZipUploadBytes * ZIP_MAX_EXPANSION_FACTOR) {
              fail(new BadRequestException('ZIP archive expands beyond the configured limit.'));
              return;
            }

            this.processEntry(zipFile, resolvedTargetDirectory, entry, fail);
          });
          zipFile.on('end', succeed);
          zipFile.on('error', (zipError) => {
            fail(this.toExtractionError(zipError));
          });
          zipFile.readEntry();
        },
      );
    });
  }

  private processEntry(
    zipFile: yauzl.ZipFile,
    targetDirectory: string,
    entry: yauzl.Entry,
    fail: (error: Error) => void,
  ): void {
    let targetPath: string;

    try {
      this.assertSafeZipEntry(entry);
      targetPath = this.resolveEntryPath(targetDirectory, entry.fileName);
    } catch (error) {
      fail(this.toExtractionError(error));
      return;
    }

    if (entry.fileName.endsWith('/')) {
      void mkdir(targetPath, { mode: ZIP_DIRECTORY_MODE, recursive: true })
        .then(() => {
          zipFile.readEntry();
        })
        .catch((error: unknown) => {
          fail(this.toExtractionError(error));
        });
      return;
    }

    void mkdir(path.dirname(targetPath), { mode: ZIP_DIRECTORY_MODE, recursive: true })
      .then(() => this.writeEntry(zipFile, entry, targetPath))
      .then(() => {
        zipFile.readEntry();
      })
      .catch((error: unknown) => {
        fail(this.toExtractionError(error));
      });
  }

  private writeEntry(
    zipFile: yauzl.ZipFile,
    entry: yauzl.Entry,
    targetPath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      zipFile.openReadStream(entry, (error, readStream) => {
        if (error) {
          reject(this.toExtractionError(error));
          return;
        }

        pipeline(readStream, createWriteStream(targetPath, { mode: ZIP_FILE_MODE })).then(
          resolve,
          (pipelineError: unknown) => {
            reject(this.toExtractionError(pipelineError));
          },
        );
      });
    });
  }

  private assertSafeZipEntry(entry: yauzl.Entry): void {
    const unixMode = (entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK;

    if (unixMode === UNIX_SYMLINK_TYPE) {
      throw new BadRequestException('ZIP archives cannot contain symbolic links.');
    }
  }

  private resolveEntryPath(targetDirectory: string, entryName: string): string {
    const normalizedEntryName = entryName.replace(/\\/g, '/');

    if (normalizedEntryName.startsWith('/') || /^[A-Za-z]:/.test(normalizedEntryName)) {
      throw new BadRequestException('ZIP archive contains an unsafe path.');
    }

    const normalizedPath = path.posix.normalize(normalizedEntryName);

    if (
      normalizedPath === '..' ||
      normalizedPath.startsWith('../') ||
      normalizedPath.length === 0
    ) {
      throw new BadRequestException('ZIP archive contains a path traversal entry.');
    }

    const resolvedPath = path.resolve(targetDirectory, normalizedPath);
    const targetPrefix = `${targetDirectory}${path.sep}`;

    if (resolvedPath !== targetDirectory && !resolvedPath.startsWith(targetPrefix)) {
      throw new BadRequestException('ZIP archive entry resolves outside the repository workspace.');
    }

    return resolvedPath;
  }

  private getRepositoryName(originalName: string): string {
    const baseName = path.basename(originalName, path.extname(originalName));
    const sanitizedName = baseName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SAFE_UPLOAD_NAME_LENGTH);

    return sanitizedName.length > 0 ? sanitizedName : 'uploaded-repository';
  }

  private toExtractionError(error: unknown): Error {
    if (error instanceof BadRequestException) {
      return error;
    }

    if (error instanceof Error) {
      return new BadRequestException(error.message);
    }

    return new InternalServerErrorException('ZIP archive extraction failed.');
  }
}
