import { ApiChangeSeverity, ApiChangeType, ApiFramework, ApiHttpMethod } from '@prisma/client';

import { ApiChangeDetectorService } from './api-change-detector.service';
import { AuthDiffService } from '../diff/auth-diff.service';
import { SchemaDiffService } from '../diff/schema-diff.service';
import { ApiRiskService } from '../risk/api-risk.service';

import type { ApiContractSnapshot, PersistedApiSnapshot } from './api-versioning.types';

function createContract(overrides: Partial<ApiContractSnapshot> = {}): ApiContractSnapshot {
  return {
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
      body: {
        properties: {
          email: {
            type: 'string',
          },
        },
        required: ['email'],
        type: 'object',
      },
      parameters: [],
    },
    responseSchema: {
      body: {
        properties: {
          id: {
            type: 'string',
          },
          name: {
            type: 'string',
          },
        },
        required: ['id', 'name'],
        type: 'object',
      },
      confidence: 'HIGH',
      statusCode: 200,
      typeName: 'UserDto',
    },
    ...overrides,
  };
}

function createSnapshot(id: string, contract: ApiContractSnapshot): PersistedApiSnapshot {
  return {
    apiId: `${id}-api`,
    contract,
    contractHash: `${id}-hash`,
    id,
    scanId: `${id}-scan`,
    version: 1,
  };
}

describe(ApiChangeDetectorService.name, () => {
  it('detects removed response fields as high-risk modifications', () => {
    const service = new ApiChangeDetectorService(
      new ApiRiskService(),
      new AuthDiffService(),
      new SchemaDiffService(),
    );

    const change = service.detectModified(
      createSnapshot('old', createContract()),
      createSnapshot(
        'new',
        createContract({
          responseSchema: {
            body: {
              properties: {
                id: {
                  type: 'string',
                },
              },
              required: ['id'],
              type: 'object',
            },
            confidence: 'HIGH',
            statusCode: 200,
            typeName: 'UserDto',
          },
        }),
      ),
    );

    expect(change).toEqual(
      expect.objectContaining({
        changeType: ApiChangeType.MODIFIED,
        description: 'Response fields were removed.',
        risk: {
          score: 90,
          severity: ApiChangeSeverity.HIGH,
        },
      }),
    );
  });

  it('detects public-to-protected auth changes as high-risk modifications', () => {
    const service = new ApiChangeDetectorService(
      new ApiRiskService(),
      new AuthDiffService(),
      new SchemaDiffService(),
    );

    const change = service.detectModified(
      createSnapshot('old', createContract()),
      createSnapshot(
        'new',
        createContract({
          authMetadata: {
            authRequired: true,
            guards: ['JwtGuard'],
            middleware: [],
            roles: ['ADMIN'],
          },
        }),
      ),
    );

    expect(change?.description).toBe('Authentication rules changed.');
    expect(change?.risk.severity).toBe(ApiChangeSeverity.HIGH);
  });
});
