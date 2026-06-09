import { ApiChangeSeverity } from '@prisma/client';

import { ApiRiskService } from './api-risk.service';

import type { ApiContractDiff } from '../versioning/api-versioning.types';

function createDiff(overrides: Partial<ApiContractDiff>): ApiContractDiff {
  return {
    auth: {
      authRequiredChanged: false,
      newRoles: [],
      oldRoles: [],
      rolesAdded: [],
      rolesRemoved: [],
    },
    methodChanged: false,
    request: {
      added: [],
      removed: [],
      typeChanged: [],
    },
    response: {
      added: [],
      removed: [],
      typeChanged: [],
    },
    ...overrides,
  };
}

describe(ApiRiskService.name, () => {
  it('scores removed endpoints and new endpoints according to governance rules', () => {
    const service = new ApiRiskService();

    expect(service.scoreRemovedEndpoint()).toEqual({
      score: 100,
      severity: ApiChangeSeverity.HIGH,
    });
    expect(service.scoreAddedEndpoint()).toEqual({
      score: 0,
      severity: ApiChangeSeverity.INFO,
    });
  });

  it('scores required request additions and auth changes as high risk', () => {
    const service = new ApiRiskService();

    expect(
      service.scoreModifiedContract(
        createDiff({
          request: {
            added: [
              {
                path: 'email',
                required: true,
                type: 'string',
              },
            ],
            removed: [],
            typeChanged: [],
          },
        }),
      ).severity,
    ).toBe(ApiChangeSeverity.HIGH);

    expect(
      service.scoreModifiedContract(
        createDiff({
          auth: {
            authRequiredChanged: true,
            newRoles: ['ADMIN'],
            oldRoles: [],
            rolesAdded: ['ADMIN'],
            rolesRemoved: [],
          },
        }),
      ).severity,
    ).toBe(ApiChangeSeverity.HIGH);
  });

  it('scores optional request field additions as low risk', () => {
    const service = new ApiRiskService();

    expect(
      service.scoreModifiedContract(
        createDiff({
          request: {
            added: [
              {
                path: 'nickname',
                required: false,
                type: 'string',
              },
            ],
            removed: [],
            typeChanged: [],
          },
        }),
      ),
    ).toEqual({
      score: 20,
      severity: ApiChangeSeverity.LOW,
    });
  });
});
