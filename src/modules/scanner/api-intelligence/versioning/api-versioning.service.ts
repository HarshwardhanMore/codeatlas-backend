import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ApiChangeDetectorService } from './api-change-detector.service';
import { ApiContractHashService } from './api-contract-hash.service';
import { ApiVersioningRepository } from '../history/api-versioning.repository';

import type {
  ApiChangeCandidate,
  ApiContractSnapshot,
  PersistedApiSnapshot,
  VersionedApiRoute,
} from './api-versioning.types';
import type {
  ApiSnapshotWithApi,
  CreateApiSnapshotInput,
} from '../history/api-versioning.repository';
import type { PersistedDetectedApi } from '../types/api-intelligence.types';

export interface ApiVersioningResult {
  changeCount: number;
  snapshotCount: number;
}

@Injectable()
export class ApiVersioningService {
  constructor(
    private readonly apiChangeDetector: ApiChangeDetectorService,
    private readonly apiContractHash: ApiContractHashService,
    private readonly apiVersioningRepository: ApiVersioningRepository,
  ) {}

  async createSnapshotsAndChanges(
    repositoryId: string,
    scanId: string,
    persistedApis: PersistedDetectedApi[],
  ): Promise<ApiVersioningResult> {
    const currentRoutes = persistedApis.map((api) => this.toVersionedApiRoute(api));
    const previousSnapshots = (
      await this.apiVersioningRepository.findLatestPreviousSnapshots(repositoryId, scanId)
    ).map((snapshot) => this.toPersistedSnapshot(snapshot));
    const snapshotInputs = this.createSnapshotInputs(currentRoutes, previousSnapshots);
    const predictedCurrentSnapshots = snapshotInputs.map((snapshot) =>
      this.toPredictedSnapshot(snapshot, scanId),
    );
    const changes = this.detectChanges(previousSnapshots, predictedCurrentSnapshots);
    const result = await this.apiVersioningRepository.createSnapshotsAndChanges(
      repositoryId,
      scanId,
      snapshotInputs,
      changes,
    );

    return {
      changeCount: result.changesCreated,
      snapshotCount: result.snapshots.length,
    };
  }

  private toVersionedApiRoute(persistedApi: PersistedDetectedApi): VersionedApiRoute {
    const contract = this.apiContractHash.createContract(persistedApi.api);

    return {
      api: persistedApi.api,
      contract,
      contractHash: this.apiContractHash.hashContract(contract),
      id: persistedApi.id,
    };
  }

  private createSnapshotInputs(
    currentRoutes: VersionedApiRoute[],
    previousSnapshots: PersistedApiSnapshot[],
  ): CreateApiSnapshotInput[] {
    return currentRoutes.map((route) => {
      const previousSnapshot = this.findPreviousSnapshotForRoute(route, previousSnapshots);
      const version =
        previousSnapshot?.contractHash === route.contractHash
          ? previousSnapshot.version
          : (previousSnapshot?.version ?? 0) + 1;

      return {
        apiId: route.id,
        contractHash: route.contractHash,
        id: randomUUID(),
        schemaJson: route.contract,
        version,
      };
    });
  }

  private detectChanges(
    previousSnapshots: PersistedApiSnapshot[],
    currentSnapshots: PersistedApiSnapshot[],
  ): ApiChangeCandidate[] {
    const changes: ApiChangeCandidate[] = [];
    const unmatchedPrevious = new Set(previousSnapshots.map((snapshot) => snapshot.id));
    const unmatchedCurrent = new Set(currentSnapshots.map((snapshot) => snapshot.id));
    const previousByRouteIdentity = new Map(
      previousSnapshots.map((snapshot) => [this.routeIdentityKey(snapshot.contract), snapshot]),
    );

    for (const currentSnapshot of currentSnapshots) {
      const previousSnapshot = previousByRouteIdentity.get(
        this.routeIdentityKey(currentSnapshot.contract),
      );

      if (!previousSnapshot) {
        continue;
      }

      unmatchedPrevious.delete(previousSnapshot.id);
      unmatchedCurrent.delete(currentSnapshot.id);

      if (previousSnapshot.contractHash === currentSnapshot.contractHash) {
        continue;
      }

      const change = this.apiChangeDetector.detectModified(previousSnapshot, currentSnapshot);

      if (change) {
        changes.push(change);
      }
    }

    this.detectMethodChanges(
      previousSnapshots,
      currentSnapshots,
      unmatchedPrevious,
      unmatchedCurrent,
      changes,
    );

    for (const previousSnapshot of previousSnapshots.filter((snapshot) =>
      unmatchedPrevious.has(snapshot.id),
    )) {
      changes.push(this.apiChangeDetector.detectRemoved(previousSnapshot, previousSnapshot.apiId));
    }

    for (const currentSnapshot of currentSnapshots.filter((snapshot) =>
      unmatchedCurrent.has(snapshot.id),
    )) {
      changes.push(this.apiChangeDetector.detectAdded(currentSnapshot));
    }

    return changes;
  }

  private detectMethodChanges(
    previousSnapshots: PersistedApiSnapshot[],
    currentSnapshots: PersistedApiSnapshot[],
    unmatchedPrevious: Set<string>,
    unmatchedCurrent: Set<string>,
    changes: ApiChangeCandidate[],
  ): void {
    const currentByPath = new Map(
      currentSnapshots
        .filter((snapshot) => unmatchedCurrent.has(snapshot.id))
        .map((snapshot) => [this.frameworkPathKey(snapshot.contract), snapshot]),
    );

    for (const previousSnapshot of previousSnapshots.filter((snapshot) =>
      unmatchedPrevious.has(snapshot.id),
    )) {
      const currentSnapshot = currentByPath.get(this.frameworkPathKey(previousSnapshot.contract));

      if (
        !currentSnapshot ||
        currentSnapshot.contract.method === previousSnapshot.contract.method
      ) {
        continue;
      }

      const change = this.apiChangeDetector.detectModified(previousSnapshot, currentSnapshot);

      if (change) {
        changes.push(change);
      }

      unmatchedPrevious.delete(previousSnapshot.id);
      unmatchedCurrent.delete(currentSnapshot.id);
    }
  }

  private findPreviousSnapshotForRoute(
    route: VersionedApiRoute,
    previousSnapshots: PersistedApiSnapshot[],
  ): PersistedApiSnapshot | null {
    return (
      previousSnapshots.find(
        (snapshot) =>
          this.routeIdentityKey(snapshot.contract) === this.routeIdentityKey(route.contract),
      ) ??
      previousSnapshots.find(
        (snapshot) =>
          this.frameworkPathKey(snapshot.contract) === this.frameworkPathKey(route.contract),
      ) ??
      null
    );
  }

  private toPredictedSnapshot(
    snapshot: CreateApiSnapshotInput,
    scanId: string,
  ): PersistedApiSnapshot {
    return {
      apiId: snapshot.apiId,
      contract: snapshot.schemaJson,
      contractHash: snapshot.contractHash,
      id: snapshot.id,
      scanId,
      version: snapshot.version,
    };
  }

  private toPersistedSnapshot(snapshot: ApiSnapshotWithApi): PersistedApiSnapshot {
    return {
      apiId: snapshot.apiId,
      contract: snapshot.schemaJson as unknown as ApiContractSnapshot,
      contractHash: snapshot.contractHash,
      id: snapshot.id,
      scanId: snapshot.scanId,
      version: snapshot.version,
    };
  }

  private routeIdentityKey(contract: ApiContractSnapshot): string {
    return `${contract.framework}:${contract.method}:${contract.path}`;
  }

  private frameworkPathKey(contract: ApiContractSnapshot): string {
    return `${contract.framework}:${contract.path}`;
  }
}
