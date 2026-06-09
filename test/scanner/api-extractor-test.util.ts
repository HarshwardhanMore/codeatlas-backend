import * as path from 'node:path';

import { ApiFramework, CodeLanguage, RepositoryProvider } from '@prisma/client';

import { ApiSourceProjectService } from '../../src/modules/scanner/api-intelligence/discovery/api-source-project.service';

import type { ApiExtractionContext } from '../../src/modules/scanner/api-intelligence/types/api-intelligence.types';
import type {
  CodeIntelligenceResult,
  ExtractedCodeFile,
  PreparedRepositoryWorkspace,
} from '../../src/modules/scanner/types/code-intelligence.types';
import type { Repository } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');
const fixturePath = path.resolve(process.cwd(), 'fixtures/scanner/api-project');

const repository: Repository = {
  archivePath: null,
  connectionId: 'connection-id',
  createdAt: timestamp,
  defaultBranch: 'main',
  externalId: 'external-id',
  fullName: 'owner/api-project',
  id: 'repository-id',
  language: 'TypeScript',
  name: 'api-project',
  ownerId: 'user-id',
  provider: RepositoryProvider.ZIP,
  sourcePath: fixturePath,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'file:///api-project.zip',
  visibility: 'private',
};

const workspace: PreparedRepositoryWorkspace = {
  cleanup: jest.fn<Promise<void>, []>(() => Promise.resolve()),
  repository,
  rootPath: fixturePath,
  sourcePath: fixturePath,
};

function createCodeFile(relativePath: string, imports: string[]): ExtractedCodeFile {
  return {
    classRelations: [],
    exports: [],
    file: {
      absolutePath: path.join(fixturePath, relativePath),
      extension: '.ts',
      language: CodeLanguage.TYPESCRIPT,
      relativePath,
      sizeBytes: 100,
    },
    hash: 'hash',
    imports: imports.map((moduleSpecifier) => ({
      line: 1,
      moduleSpecifier,
      namedImports: [],
    })),
    lineCount: 1,
    metadata: {},
    methodCalls: [],
    parseError: null,
    parseStatus: 'SUCCESS',
    symbols: [],
  };
}

export async function createApiExtractionContext(
  frameworks: ApiFramework[],
): Promise<ApiExtractionContext> {
  const codeIntelligence: CodeIntelligenceResult = {
    dependencies: [],
    discovery: {
      files: [],
      ignoredFiles: [],
      totalVisitedFiles: 0,
    },
    files: [
      createCodeFile('src/users.controller.ts', ['@nestjs/common', './roles.decorator']),
      createCodeFile('src/roles.decorator.ts', []),
      createCodeFile('src/express-routes.ts', ['express']),
    ],
    frameworks: frameworks.map((framework) => ({
      confidence: 95,
      evidence: [`test:${framework}`],
      framework: framework === ApiFramework.NESTJS ? 'NestJS' : 'Express',
    })),
    languages: {
      primaryLanguage: CodeLanguage.TYPESCRIPT,
      stats: [],
    },
    parseFailureCount: 0,
  };
  const sourceProject = await new ApiSourceProjectService().createSourceProject(codeIntelligence);

  return {
    codeIntelligence,
    sourceProject,
    workspace,
  };
}
