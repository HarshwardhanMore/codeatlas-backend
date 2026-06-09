import type {
  CodeIntelligenceResult,
  ExtractedCodeFile,
  PreparedRepositoryWorkspace,
} from '../../types/code-intelligence.types';
import type { ApiFramework, ApiHttpMethod, DetectedApi, Prisma, Repository } from '@prisma/client';
import type { SourceFile } from 'ts-morph';

export type ApiSchemaConfidence = 'HIGH' | 'LOW' | 'MEDIUM';

export interface ApiSchemaProperty {
  format?: string;
  items?: ApiSchemaProperty;
  properties?: Record<string, ApiSchemaProperty>;
  required?: string[];
  type: string;
}

export interface ApiParameterSchema {
  in: 'header' | 'path' | 'query';
  name: string;
  required: boolean;
  schema: ApiSchemaProperty;
}

export interface ApiRequestSchema {
  body: ApiSchemaProperty | null;
  parameters: ApiParameterSchema[];
}

export interface ApiResponseSchema {
  body: ApiSchemaProperty | null;
  confidence: ApiSchemaConfidence;
  statusCode: number;
  typeName: string | null;
}

export interface ApiAuthMetadata {
  authRequired: boolean;
  guards: string[];
  middleware: string[];
  roles: string[];
}

export interface DiscoveredApiRoute {
  authMetadata: ApiAuthMetadata;
  controllerName: string | null;
  filePath: string;
  framework: ApiFramework;
  handlerName: string | null;
  lineNumber: number;
  method: ApiHttpMethod;
  path: string;
  requestSchema: ApiRequestSchema;
  responseSchema: ApiResponseSchema;
}

export interface ApiExtractionSourceProject {
  codeFileByPath: Map<string, ExtractedCodeFile>;
  sourceFiles: SourceFile[];
}

export interface ApiExtractionContext {
  codeIntelligence: CodeIntelligenceResult;
  sourceProject: ApiExtractionSourceProject;
  workspace: PreparedRepositoryWorkspace;
}

export interface ApiSchemaRegistry {
  schemas: Record<string, ApiSchemaProperty>;
}

export interface ApiExtractionMetadata {
  framework: ApiFramework;
  routeCount: number;
  schemaCount: number;
}

export interface ApiExtractor {
  extractMetadata(context: ApiExtractionContext): Promise<ApiExtractionMetadata>;
  extractRoutes(context: ApiExtractionContext): Promise<DiscoveredApiRoute[]>;
  extractSchemas(context: ApiExtractionContext): Promise<ApiSchemaRegistry>;
  supports(context: ApiExtractionContext): boolean;
}

export interface ApiDocumentationArtifact {
  apiId: string;
  markdown: string;
  openApiJson: Prisma.InputJsonValue;
}

export interface PersistedDetectedApi {
  api: DiscoveredApiRoute;
  id: string;
}

export interface ApiIntelligenceResult {
  apis: DiscoveredApiRoute[];
  changeCount: number;
  documentationCount: number;
  extractorMetadata: ApiExtractionMetadata[];
  snapshotCount: number;
}

export interface ApiIntelligenceProgressUpdate {
  metadata: Record<string, unknown>;
  progress: number;
  stage: string;
}

export interface DiscoverApisInput {
  abortSignal?: AbortSignal;
  codeIntelligence: CodeIntelligenceResult;
  onProgress(update: ApiIntelligenceProgressUpdate): Promise<void>;
  scanId: string;
  workspace: PreparedRepositoryWorkspace;
}

export type DetectedApiWithDocumentation = DetectedApi & {
  apiDocumentation: {
    markdown: string;
    openApiJson: Prisma.JsonValue;
  } | null;
};

export interface ApiCatalogRepositoryContext {
  repository: Repository;
}
