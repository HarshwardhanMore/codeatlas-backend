import type {
  ApiChange,
  ApiDocumentation,
  ApiSnapshot,
  CodeDependency,
  CodeFile,
  CodeSymbol,
  DetectedApi,
  Repository,
  ScanJob,
} from '@prisma/client';

export interface AiDetectedApiContext extends DetectedApi {
  apiDocumentation: Pick<ApiDocumentation, 'markdown' | 'openApiJson'> | null;
}

export interface AiApiChangeContext extends ApiChange {
  newSnapshot: ApiSnapshot | null;
  oldSnapshot: ApiSnapshot | null;
}

export interface AiRepositoryIntelligenceContext {
  apiChanges: AiApiChangeContext[];
  apis: AiDetectedApiContext[];
  codeDependencies: CodeDependency[];
  codeFiles: CodeFile[];
  codeSymbols: CodeSymbol[];
  latestScan: ScanJob | null;
  repository: Repository;
}

export interface BuiltAiContext {
  contextText: string;
  stats: {
    apiCount: number;
    changeCount: number;
    dependencyCount: number;
    fileCount: number;
    symbolCount: number;
  };
}
