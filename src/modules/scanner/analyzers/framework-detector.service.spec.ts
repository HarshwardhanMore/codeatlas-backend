import * as path from 'node:path';

import { CodeLanguage, RepositoryProvider } from '@prisma/client';

import { FrameworkDetectorService } from './framework-detector.service';

import type {
  DiscoveredCodeFile,
  PreparedRepositoryWorkspace,
} from '../types/code-intelligence.types';
import type { Repository } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');
const fixturePath = path.resolve(process.cwd(), 'fixtures/scanner/typescript-nest');

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
  provider: RepositoryProvider.ZIP,
  sourcePath: fixturePath,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'file:///api.zip',
  visibility: 'private',
};

const workspace: PreparedRepositoryWorkspace = {
  cleanup: jest.fn<Promise<void>, []>(() => Promise.resolve()),
  repository,
  rootPath: fixturePath,
  sourcePath: fixturePath,
};

const files: DiscoveredCodeFile[] = [
  {
    absolutePath: path.join(fixturePath, 'src/users.service.ts'),
    extension: '.ts',
    language: CodeLanguage.TYPESCRIPT,
    relativePath: 'src/users.service.ts',
    sizeBytes: 100,
  },
];

describe(FrameworkDetectorService.name, () => {
  it('detects NestJS from package and import evidence', async () => {
    const service = new FrameworkDetectorService();

    const result = await service.detect(workspace, files);
    const detection = result[0];

    expect(detection?.framework).toBe('NestJS');
    expect(typeof detection?.confidence).toBe('number');
    expect(detection?.evidence).toEqual(
      expect.arrayContaining(['package:@nestjs/common', 'import:@nestjs/*']),
    );
  });
});
