import {
  ApiFramework,
  ApiHttpMethod,
  CodeDependencyKind,
  CodeLanguage,
  CodeSymbolKind,
  RepositoryProvider,
  ScanStatus,
} from '@prisma/client';

import { AiContextBuilderService } from './ai-context-builder.service';

import type { AiRepositoryIntelligenceContext } from './ai-context.types';
import type {
  AiConversationsRepository,
  RepositoryContextSearchInput,
} from '../repositories/ai-conversations.repository';
import type { ConfigService } from '@nestjs/config';
import type {
  ApiChange,
  ApiSnapshot,
  CodeDependency,
  CodeFile,
  CodeSymbol,
  DetectedApi,
  Repository,
  ScanJob,
} from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

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
  provider: RepositoryProvider.GITHUB,
  sourcePath: null,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'https://github.com/owner/api',
  visibility: 'private',
};

const latestScan: ScanJob = {
  createdAt: timestamp,
  errorMessage: null,
  finishedAt: timestamp,
  id: 'scan-id',
  metadata: {
    frameworks: [{ framework: 'NestJS' }],
  },
  progress: 100,
  repositoryId: repository.id,
  startedAt: timestamp,
  status: ScanStatus.COMPLETED,
  updatedAt: timestamp,
};

const api: DetectedApi = {
  authMetadata: {
    authRequired: false,
    roles: [],
  },
  controllerName: 'AuthController',
  createdAt: timestamp,
  filePath: 'src/modules/auth/auth.controller.ts',
  framework: ApiFramework.NESTJS,
  handlerName: 'login',
  id: 'api-id',
  lineNumber: 42,
  method: ApiHttpMethod.POST,
  path: '/auth/login',
  repositoryId: repository.id,
  requestSchema: {
    body: {
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['email', 'password'],
      type: 'object',
    },
  },
  responseSchema: {
    body: {
      properties: {
        accessToken: { type: 'string' },
      },
      type: 'object',
    },
  },
  scanId: latestScan.id,
  updatedAt: timestamp,
};

const codeFile: CodeFile = {
  createdAt: timestamp,
  hash: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
  id: 'code-file-id',
  language: CodeLanguage.TYPESCRIPT,
  lineCount: 90,
  metadata: {},
  parseError: null,
  parseStatus: 'SUCCESS',
  path: 'src/modules/auth/auth.service.ts',
  repositoryId: repository.id,
  scanId: latestScan.id,
  sizeBytes: 2048,
  updatedAt: timestamp,
};

const codeSymbol: CodeSymbol = {
  codeFileId: codeFile.id,
  createdAt: timestamp,
  endLine: 30,
  id: 'symbol-id',
  kind: CodeSymbolKind.CLASS,
  metadata: {
    filePath: codeFile.path,
  },
  name: 'AuthService',
  qualifiedName: 'AuthService',
  repositoryId: repository.id,
  scanId: latestScan.id,
  startLine: 10,
  updatedAt: timestamp,
};

const dependency: CodeDependency = {
  createdAt: timestamp,
  id: 'dependency-id',
  kind: CodeDependencyKind.IMPORT,
  metadata: {},
  repositoryId: repository.id,
  scanId: latestScan.id,
  sourceFileId: codeFile.id,
  sourcePath: codeFile.path,
  specifier: './token.service',
  targetFileId: null,
  targetPath: null,
  updatedAt: timestamp,
};

const snapshot: ApiSnapshot = {
  apiId: api.id,
  contractHash: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
  createdAt: timestamp,
  id: 'snapshot-id',
  repositoryId: repository.id,
  scanId: latestScan.id,
  schemaJson: {
    method: 'POST',
    path: '/auth/login',
  },
  version: 1,
};

const apiChange: ApiChange = {
  apiId: api.id,
  changeType: 'MODIFIED',
  createdAt: timestamp,
  description: 'Authentication rules changed.',
  id: 'change-id',
  metadata: {
    riskScore: 90,
  },
  newSnapshotId: snapshot.id,
  oldSnapshotId: null,
  repositoryId: repository.id,
  scanId: latestScan.id,
  severity: 'HIGH',
};

function createContextData(): AiRepositoryIntelligenceContext {
  return {
    apiChanges: [
      {
        ...apiChange,
        newSnapshot: snapshot,
        oldSnapshot: null,
      },
    ],
    apis: [
      {
        ...api,
        apiDocumentation: {
          markdown: 'POST /auth/login validates credentials and returns tokens.',
          openApiJson: {},
        },
      },
    ],
    codeDependencies: [dependency],
    codeFiles: [codeFile],
    codeSymbols: [codeSymbol],
    latestScan,
    repository,
  };
}

describe(AiContextBuilderService.name, () => {
  it('builds bounded context from stored repository intelligence', async () => {
    const repositoryContext = createContextData();
    const findRepositoryContext: jest.MockedFunction<
      (
        repositoryId: string,
        userId: string,
        search?: RepositoryContextSearchInput,
      ) => Promise<AiRepositoryIntelligenceContext | null>
    > = jest.fn().mockResolvedValue(repositoryContext);
    const aiConversationsRepository = {
      findRepositoryContext,
    } as unknown as AiConversationsRepository;
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ai.maxContextTokens') {
          return 2000;
        }

        return '';
      }),
    } as unknown as ConfigService;
    const service = new AiContextBuilderService(aiConversationsRepository, configService);

    const context = await service.buildContext(
      repository.ownerId,
      repository.id,
      'Explain POST /auth/login',
    );
    const searchInput = findRepositoryContext.mock.calls[0]?.[2];

    if (!searchInput) {
      throw new Error('AI context search input was not passed.');
    }

    expect(context.contextText).toContain('Repository: owner/api');
    expect(context.contextText).toContain('POST /auth/login');
    expect(context.contextText).toContain('AuthController.login');
    expect(context.contextText).toContain('AuthService');
    expect(findRepositoryContext).toHaveBeenCalledWith(
      repository.id,
      repository.ownerId,
      expect.any(Object),
    );
    expect(searchInput.endpointPath).toBe('/auth/login');
    expect(searchInput.httpMethod).toBe(ApiHttpMethod.POST);
    expect(searchInput.terms).toEqual(expect.arrayContaining(['auth', 'login']));
    expect(context.stats).toEqual({
      apiCount: 1,
      changeCount: 1,
      dependencyCount: 1,
      fileCount: 1,
      symbolCount: 1,
    });
  });
});
