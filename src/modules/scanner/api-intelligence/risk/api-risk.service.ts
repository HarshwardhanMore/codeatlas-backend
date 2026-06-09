import { Injectable } from '@nestjs/common';
import { ApiChangeSeverity, ApiChangeType } from '@prisma/client';

import type { ApiContractDiff, RiskScore } from '../versioning/api-versioning.types';

@Injectable()
export class ApiRiskService {
  scoreAddedEndpoint(): RiskScore {
    return {
      score: 0,
      severity: ApiChangeSeverity.INFO,
    };
  }

  scoreRemovedEndpoint(): RiskScore {
    return {
      score: 100,
      severity: ApiChangeSeverity.HIGH,
    };
  }

  scoreModifiedContract(diff: ApiContractDiff): RiskScore {
    if (
      diff.methodChanged ||
      diff.response.removed.length > 0 ||
      diff.response.typeChanged.length > 0 ||
      diff.request.typeChanged.length > 0 ||
      diff.request.added.some((field) => field.required === true) ||
      diff.auth.authRequiredChanged ||
      diff.auth.rolesAdded.length > 0 ||
      diff.auth.rolesRemoved.length > 0
    ) {
      return {
        score: 90,
        severity: ApiChangeSeverity.HIGH,
      };
    }

    if (diff.request.added.length > 0 || diff.response.added.length > 0) {
      return {
        score: 20,
        severity: ApiChangeSeverity.LOW,
      };
    }

    return {
      score: 50,
      severity: ApiChangeSeverity.MEDIUM,
    };
  }

  describeChange(changeType: ApiChangeType, diff?: ApiContractDiff): string {
    if (changeType === ApiChangeType.ADDED) {
      return 'Endpoint was added.';
    }

    if (changeType === ApiChangeType.REMOVED) {
      return 'Endpoint was removed.';
    }

    if (!diff) {
      return 'Endpoint contract was modified.';
    }

    if (diff.methodChanged) {
      return 'HTTP method changed.';
    }

    if (diff.response.removed.length > 0) {
      return 'Response fields were removed.';
    }

    if (diff.request.added.some((field) => field.required === true)) {
      return 'Required request fields were added.';
    }

    if (
      diff.auth.authRequiredChanged ||
      diff.auth.rolesAdded.length > 0 ||
      diff.auth.rolesRemoved.length > 0
    ) {
      return 'Authentication rules changed.';
    }

    return 'Endpoint contract was modified.';
  }
}
