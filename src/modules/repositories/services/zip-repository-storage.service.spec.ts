import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { BadRequestException } from '@nestjs/common';

import { ZipRepositoryStorageService } from './zip-repository-storage.service';

import type { ConfigService } from '@nestjs/config';

function createConfigService(storagePath: string): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): number | string => {
      const values: Record<string, number | string> = {
        'repositories.maxZipUploadBytes': 1024 * 1024,
        'repositories.storagePath': storagePath,
      };

      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
}

function createFile(buffer: Buffer): Express.Multer.File {
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: 'service.zip',
    mimetype: 'application/zip',
    originalname: 'service.zip',
    path: '',
    size: buffer.length,
    stream: null as unknown as Express.Multer.File['stream'],
  };
}

describe(ZipRepositoryStorageService.name, () => {
  it('removes partial repository storage when archive extraction fails', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codeatlas-zip-storage-'));
    const storagePath = path.join(tempRoot, 'repositories');
    const service = new ZipRepositoryStorageService(createConfigService(storagePath));
    const repositoryRoot = path.join(storagePath, 'user-id', 'repository-id');

    try {
      await expect(
        service.storeZipRepository({
          file: createFile(Buffer.from('not a zip archive')),
          repositoryId: 'repository-id',
          userId: 'user-id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(existsSync(repositoryRoot)).toBe(false);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
