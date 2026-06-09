import { Injectable } from '@nestjs/common';
import { ApiHttpMethod } from '@prisma/client';

import type {
  ApiParameterSchema,
  ApiSchemaProperty,
  DiscoveredApiRoute,
} from '../types/api-intelligence.types';
import type { DetectedApi } from '@prisma/client';

interface OpenApiMediaType {
  schema: ApiSchemaProperty;
}

interface OpenApiRequestBody {
  content: Record<string, OpenApiMediaType>;
  required: boolean;
}

interface OpenApiResponse {
  content?: Record<string, OpenApiMediaType>;
  description: string;
}

interface OpenApiOperation {
  operationId: string;
  parameters?: ApiParameterSchema[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Record<string, string[]>[];
  summary: string;
  tags: string[];
}

export interface OpenApiDocument {
  components?: {
    securitySchemes?: Record<string, Record<string, string>>;
  };
  info: {
    title: string;
    version: string;
  };
  openapi: string;
  paths: Record<string, Partial<Record<Lowercase<ApiHttpMethod>, OpenApiOperation>>>;
}

@Injectable()
export class OpenApiGeneratorService {
  generateRepositoryDocument(repositoryName: string, apis: DiscoveredApiRoute[]): OpenApiDocument {
    return {
      components: this.hasSecuredApis(apis)
        ? {
            securitySchemes: {
              bearerAuth: {
                bearerFormat: 'JWT',
                scheme: 'bearer',
                type: 'http',
              },
            },
          }
        : undefined,
      info: {
        title: `${repositoryName} API`,
        version: '1.0.0',
      },
      openapi: '3.1.0',
      paths: this.generatePaths(apis),
    };
  }

  generateRouteDocument(api: DiscoveredApiRoute): OpenApiDocument {
    return this.generateRepositoryDocument('Detected API', [api]);
  }

  generateRepositoryDocumentFromRecords(
    repositoryName: string,
    apis: DetectedApi[],
  ): OpenApiDocument {
    return this.generateRepositoryDocument(
      repositoryName,
      apis.map((api) => ({
        authMetadata: this.asAuthMetadata(api.authMetadata),
        controllerName: api.controllerName,
        filePath: api.filePath,
        framework: api.framework,
        handlerName: api.handlerName,
        lineNumber: api.lineNumber,
        method: api.method,
        path: api.path,
        requestSchema: this.asRequestSchema(api.requestSchema),
        responseSchema: this.asResponseSchema(api.responseSchema, api.method),
      })),
    );
  }

  private generatePaths(
    apis: DiscoveredApiRoute[],
  ): Record<string, Partial<Record<Lowercase<ApiHttpMethod>, OpenApiOperation>>> {
    const paths: Record<string, Partial<Record<Lowercase<ApiHttpMethod>, OpenApiOperation>>> = {};

    for (const api of apis) {
      const openApiPath = this.toOpenApiPath(api.path);
      const method = api.method.toLowerCase() as Lowercase<ApiHttpMethod>;

      paths[openApiPath] = {
        ...paths[openApiPath],
        [method]: this.toOperation(api),
      };
    }

    return paths;
  }

  private toOperation(api: DiscoveredApiRoute): OpenApiOperation {
    return {
      operationId: this.toOperationId(api),
      parameters: api.requestSchema.parameters,
      requestBody: api.requestSchema.body
        ? {
            content: {
              'application/json': {
                schema: api.requestSchema.body,
              },
            },
            required: true,
          }
        : undefined,
      responses: {
        [api.responseSchema.statusCode.toString()]: {
          content: api.responseSchema.body
            ? {
                'application/json': {
                  schema: api.responseSchema.body,
                },
              }
            : undefined,
          description: api.responseSchema.body
            ? 'Successful response.'
            : 'Response schema unknown.',
        },
      },
      security: api.authMetadata.authRequired ? [{ bearerAuth: [] }] : undefined,
      summary: `${api.method} ${api.path}`,
      tags: [api.controllerName ?? api.framework],
    };
  }

  private toOperationId(api: DiscoveredApiRoute): string {
    const handler = api.handlerName ?? `${api.method}_${api.path}`;

    return handler.replace(/[^A-Za-z0-9_]/g, '_');
  }

  private toOpenApiPath(path: string): string {
    return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  }

  private hasSecuredApis(apis: DiscoveredApiRoute[]): boolean {
    return apis.some((api) => api.authMetadata.authRequired);
  }

  private asAuthMetadata(value: unknown): DiscoveredApiRoute['authMetadata'] {
    if (this.isRecord(value)) {
      return {
        authRequired: value['authRequired'] === true,
        guards: this.asStringArray(value['guards']),
        middleware: this.asStringArray(value['middleware']),
        roles: this.asStringArray(value['roles']),
      };
    }

    return {
      authRequired: false,
      guards: [],
      middleware: [],
      roles: [],
    };
  }

  private asRequestSchema(value: unknown): DiscoveredApiRoute['requestSchema'] {
    if (this.isRecord(value)) {
      return {
        body: this.asSchema(value['body']),
        parameters: Array.isArray(value['parameters'])
          ? value['parameters'].filter((item): item is ApiParameterSchema =>
              this.isApiParameterSchema(item),
            )
          : [],
      };
    }

    return {
      body: null,
      parameters: [],
    };
  }

  private asResponseSchema(
    value: unknown,
    method: ApiHttpMethod,
  ): DiscoveredApiRoute['responseSchema'] {
    if (this.isRecord(value)) {
      return {
        body: this.asSchema(value['body']),
        confidence:
          value['confidence'] === 'HIGH' || value['confidence'] === 'MEDIUM'
            ? value['confidence']
            : 'LOW',
        statusCode:
          typeof value['statusCode'] === 'number'
            ? value['statusCode']
            : method === ApiHttpMethod.POST
              ? 201
              : 200,
        typeName: typeof value['typeName'] === 'string' ? value['typeName'] : null,
      };
    }

    return {
      body: null,
      confidence: 'LOW',
      statusCode: method === ApiHttpMethod.POST ? 201 : 200,
      typeName: null,
    };
  }

  private isApiParameterSchema(value: unknown): value is ApiParameterSchema {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value['name'] === 'string' &&
      typeof value['required'] === 'boolean' &&
      (value['in'] === 'path' || value['in'] === 'query' || value['in'] === 'header') &&
      this.asSchema(value['schema']) !== null
    );
  }

  private asSchema(value: unknown): ApiSchemaProperty | null {
    if (!this.isRecord(value) || typeof value['type'] !== 'string') {
      return null;
    }

    return value as unknown as ApiSchemaProperty;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
