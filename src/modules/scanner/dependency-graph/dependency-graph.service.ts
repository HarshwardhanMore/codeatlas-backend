import { Injectable, NotFoundException } from '@nestjs/common';

import { DependencyGraphRepository } from './dependency-graph.repository';

import type { CodeDependencyWithFiles } from './dependency-graph.repository';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { CodeDependencyKind, CodeLanguage } from '@prisma/client';

export type DependencyGraphNodeType = 'EXTERNAL' | 'FILE';

export interface DependencyGraphNodeResponse {
  id: string;
  label: string;
  language: CodeLanguage | null;
  path: string | null;
  type: DependencyGraphNodeType;
}

export interface DependencyGraphEdgeResponse {
  id: string;
  kind: CodeDependencyKind;
  source: string;
  specifier: string;
  target: string;
}

export interface DependencyGraphResponse {
  edges: DependencyGraphEdgeResponse[];
  nodes: DependencyGraphNodeResponse[];
  repositoryId: string;
  scanId: string | null;
}

@Injectable()
export class DependencyGraphService {
  constructor(private readonly dependencyGraphRepository: DependencyGraphRepository) {}

  async getRepositoryDependencyGraph(
    user: AuthenticatedUser,
    repositoryId: string,
  ): Promise<DependencyGraphResponse> {
    const repository = await this.dependencyGraphRepository.findRepositoryForUser(
      repositoryId,
      user.id,
    );

    if (!repository) {
      throw new NotFoundException('Repository was not found.');
    }

    const latestScan = await this.dependencyGraphRepository.findLatestCompletedScan(repositoryId);

    if (!latestScan) {
      return {
        edges: [],
        nodes: [],
        repositoryId,
        scanId: null,
      };
    }

    const dependencies = await this.dependencyGraphRepository.listDependenciesForScan(
      repositoryId,
      latestScan.id,
    );

    return {
      edges: dependencies.map((dependency) => this.toEdge(dependency)),
      nodes: this.toNodes(dependencies),
      repositoryId,
      scanId: latestScan.id,
    };
  }

  private toNodes(dependencies: CodeDependencyWithFiles[]): DependencyGraphNodeResponse[] {
    const nodesById = new Map<string, DependencyGraphNodeResponse>();

    for (const dependency of dependencies) {
      nodesById.set(dependency.sourceFile.id, {
        id: dependency.sourceFile.id,
        label: dependency.sourceFile.path,
        language: dependency.sourceFile.language,
        path: dependency.sourceFile.path,
        type: 'FILE',
      });

      if (dependency.targetFile) {
        nodesById.set(dependency.targetFile.id, {
          id: dependency.targetFile.id,
          label: dependency.targetFile.path,
          language: dependency.targetFile.language,
          path: dependency.targetFile.path,
          type: 'FILE',
        });
        continue;
      }

      const externalNodeId = this.createExternalNodeId(dependency.specifier);
      nodesById.set(externalNodeId, {
        id: externalNodeId,
        label: dependency.specifier,
        language: null,
        path: null,
        type: 'EXTERNAL',
      });
    }

    return [...nodesById.values()];
  }

  private toEdge(dependency: CodeDependencyWithFiles): DependencyGraphEdgeResponse {
    return {
      id: dependency.id,
      kind: dependency.kind,
      source: dependency.sourceFile.id,
      specifier: dependency.specifier,
      target: dependency.targetFile?.id ?? this.createExternalNodeId(dependency.specifier),
    };
  }

  private createExternalNodeId(specifier: string): string {
    return `external:${Buffer.from(specifier, 'utf8').toString('base64url')}`;
  }
}
