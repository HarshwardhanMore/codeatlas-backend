import type {
  ApiAuthMetadata,
  ApiRequestSchema,
  ApiResponseSchema,
  ApiSchemaProperty,
  DiscoveredApiRoute,
} from '../types/api-intelligence.types';
import type {
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  ApiHttpMethod,
  Prisma,
} from '@prisma/client';

export interface ApiContractSnapshot {
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

export interface VersionedApiRoute {
  api: DiscoveredApiRoute;
  contract: ApiContractSnapshot;
  contractHash: string;
  id: string;
}

export interface PersistedApiSnapshot {
  apiId: string;
  contract: ApiContractSnapshot;
  contractHash: string;
  id: string;
  scanId: string;
  version: number;
}

export interface SchemaFieldChange {
  path: string;
  required?: boolean;
  type?: string;
}

export interface SchemaDiffResult {
  added: SchemaFieldChange[];
  removed: SchemaFieldChange[];
  typeChanged: {
    newType: string;
    oldType: string;
    path: string;
  }[];
}

export interface AuthDiffResult {
  authRequiredChanged: boolean;
  newRoles: string[];
  oldRoles: string[];
  rolesAdded: string[];
  rolesRemoved: string[];
}

export interface ApiContractDiff {
  auth: AuthDiffResult;
  methodChanged: boolean;
  request: SchemaDiffResult;
  response: SchemaDiffResult;
}

export interface RiskScore {
  score: number;
  severity: ApiChangeSeverity;
}

export interface ApiChangeCandidate {
  apiId: string;
  changeType: ApiChangeType;
  description: string;
  metadata: Prisma.InputJsonValue;
  newSnapshotId: string | null;
  oldSnapshotId: string | null;
  risk: RiskScore;
}

export interface ApiSchemaObjectLike {
  properties?: Record<string, ApiSchemaProperty>;
  required?: string[];
  type?: string;
}
