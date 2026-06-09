import { ApiChangeType, ApiFramework, ApiHttpMethod, type Prisma } from '@prisma/client';

import { ApiChangeDetectorService } from './api-change-detector.service';
import { ApiContractHashService } from './api-contract-hash.service';
import { ApiVersioningService } from './api-versioning.service';
import { AuthDiffService } from '../diff/auth-diff.service';
import { SchemaDiffService } from '../diff/schema-diff.service';
import { ApiRiskService } from '../risk/api-risk.service';

import type { ApiChangeCandidate } from './api-versioning.types';
import type {
  ApiVersioningRepository,
  ApiVersioningWriteResult,
  CreateApiSnapshotInput,
} from '../history/api-versioning.repository';
import type { PersistedDetectedApi } from '../types/api-intelligence.types';

const persistedApi: PersistedDetectedApi = {
  api: {
    authMetadata: {
      authRequired: false,
      guards: [],
      middleware: [],
      roles: [],
    },
    controllerName: 'UsersController',
    filePath: 'src/users.controller.ts',
    framework: ApiFramework.NESTJS,
    handlerName: 'getUser',
    lineNumber: 10,
    method: ApiHttpMethod.GET,
    path: '/users/:id',
    requestSchema: {
      body: null,
      parameters: [],
    },
    responseSchema: {
      body: null,
      confidence: 'LOW',
      statusCode: 200,
      typeName: null,
    },
  },
  id: 'api-id',
};

describe(ApiVersioningService.name, () => {
  it('creates immutable snapshots and added-endpoint changes for first scan', async () => {
    const createSnapshotsAndChanges = jest.fn<
      Promise<ApiVersioningWriteResult>,
      [string, string, CreateApiSnapshotInput[], ApiChangeCandidate[]]
    >((_repositoryId, _scanId, snapshots, changes) =>
      Promise.resolve({
        changesCreated: changes.length,
        snapshots: snapshots.map((snapshot) => ({
          apiId: snapshot.apiId,
          contractHash: snapshot.contractHash,
          createdAt: new Date('2026-06-08T00:00:00.000Z'),
          id: snapshot.id,
          repositoryId: 'repository-id',
          scanId: 'scan-id',
          schemaJson: snapshot.schemaJson as unknown as Prisma.JsonValue,
          version: snapshot.version,
        })),
      }),
    );
    const repository = {
      createSnapshotsAndChanges,
      findLatestPreviousSnapshots: jest.fn(() => Promise.resolve([])),
    } as unknown as ApiVersioningRepository;
    const service = new ApiVersioningService(
      new ApiChangeDetectorService(
        new ApiRiskService(),
        new AuthDiffService(),
        new SchemaDiffService(),
      ),
      new ApiContractHashService(),
      repository,
    );

    const result = await service.createSnapshotsAndChanges('repository-id', 'scan-id', [
      persistedApi,
    ]);

    expect(result).toEqual({
      changeCount: 1,
      snapshotCount: 1,
    });
    expect(createSnapshotsAndChanges.mock.calls[0]?.[2][0]).toEqual(
      expect.objectContaining({
        apiId: 'api-id',
        version: 1,
      }),
    );
    expect(createSnapshotsAndChanges.mock.calls[0]?.[3][0]?.changeType).toBe(ApiChangeType.ADDED);
  });
});
