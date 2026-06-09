import type { Repository, RepositoryProvider } from '@prisma/client';

export interface MaterializeRepositorySourceInput {
  abortSignal?: AbortSignal;
  repository: Repository;
  scanId: string;
  selectedBranch: string | null;
}

export interface MaterializedRepositorySource {
  branch: string | null;
  cleanup(): Promise<void>;
  commitSha: string | null;
  provider: RepositoryProvider;
  sourcePath: string;
}

export interface SourceMaterializer {
  materialize(input: MaterializeRepositorySourceInput): Promise<MaterializedRepositorySource>;
  supports(provider: RepositoryProvider): boolean;
}
