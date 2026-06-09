import { Injectable } from '@nestjs/common';
import { ApiChangeType } from '@prisma/client';

import { AuthDiffService } from '../diff/auth-diff.service';
import { SchemaDiffService } from '../diff/schema-diff.service';
import { ApiRiskService } from '../risk/api-risk.service';

import type {
  ApiChangeCandidate,
  ApiContractDiff,
  ApiContractSnapshot,
  PersistedApiSnapshot,
} from './api-versioning.types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ApiChangeDetectorService {
  constructor(
    private readonly apiRiskService: ApiRiskService,
    private readonly authDiffService: AuthDiffService,
    private readonly schemaDiffService: SchemaDiffService,
  ) {}

  detectAdded(snapshot: PersistedApiSnapshot): ApiChangeCandidate {
    return {
      apiId: snapshot.apiId,
      changeType: ApiChangeType.ADDED,
      description: this.apiRiskService.describeChange(ApiChangeType.ADDED),
      metadata: {
        riskScore: this.apiRiskService.scoreAddedEndpoint().score,
      },
      newSnapshotId: snapshot.id,
      oldSnapshotId: null,
      risk: this.apiRiskService.scoreAddedEndpoint(),
    };
  }

  detectRemoved(snapshot: PersistedApiSnapshot, scanApiId: string): ApiChangeCandidate {
    return {
      apiId: scanApiId,
      changeType: ApiChangeType.REMOVED,
      description: this.apiRiskService.describeChange(ApiChangeType.REMOVED),
      metadata: {
        riskScore: this.apiRiskService.scoreRemovedEndpoint().score,
      },
      newSnapshotId: null,
      oldSnapshotId: snapshot.id,
      risk: this.apiRiskService.scoreRemovedEndpoint(),
    };
  }

  detectModified(
    oldSnapshot: PersistedApiSnapshot,
    newSnapshot: PersistedApiSnapshot,
  ): ApiChangeCandidate | null {
    const diff = this.diffContracts(oldSnapshot.contract, newSnapshot.contract);

    if (!this.hasDiff(diff)) {
      return null;
    }

    const risk = this.apiRiskService.scoreModifiedContract(diff);

    return {
      apiId: newSnapshot.apiId,
      changeType: ApiChangeType.MODIFIED,
      description: this.apiRiskService.describeChange(ApiChangeType.MODIFIED, diff),
      metadata: {
        diff: diff as unknown as Prisma.InputJsonValue,
        riskScore: risk.score,
      },
      newSnapshotId: newSnapshot.id,
      oldSnapshotId: oldSnapshot.id,
      risk,
    };
  }

  diffContracts(
    oldContract: ApiContractSnapshot,
    newContract: ApiContractSnapshot,
  ): ApiContractDiff {
    return {
      auth: this.authDiffService.diff(oldContract.authMetadata, newContract.authMetadata),
      methodChanged: oldContract.method !== newContract.method,
      request: this.schemaDiffService.diff(
        oldContract.requestSchema.body,
        newContract.requestSchema.body,
      ),
      response: this.schemaDiffService.diff(
        oldContract.responseSchema.body,
        newContract.responseSchema.body,
      ),
    };
  }

  private hasDiff(diff: ApiContractDiff): boolean {
    return (
      diff.methodChanged ||
      diff.auth.authRequiredChanged ||
      diff.auth.rolesAdded.length > 0 ||
      diff.auth.rolesRemoved.length > 0 ||
      diff.request.added.length > 0 ||
      diff.request.removed.length > 0 ||
      diff.request.typeChanged.length > 0 ||
      diff.response.added.length > 0 ||
      diff.response.removed.length > 0 ||
      diff.response.typeChanged.length > 0
    );
  }
}
