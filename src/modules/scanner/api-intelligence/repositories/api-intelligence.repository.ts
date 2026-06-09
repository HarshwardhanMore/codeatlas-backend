import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

import type {
  ApiDocumentationArtifact,
  DiscoveredApiRoute,
  PersistedDetectedApi,
} from '../types/api-intelligence.types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ApiIntelligenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceScanApis(
    repositoryId: string,
    scanId: string,
    apis: DiscoveredApiRoute[],
    createDocumentation: (persistedApi: PersistedDetectedApi) => ApiDocumentationArtifact,
  ): Promise<PersistedDetectedApi[]> {
    const persistedApis = apis.map((api) => ({
      api,
      id: randomUUID(),
    }));
    const documentation = persistedApis.map((persistedApi) => createDocumentation(persistedApi));

    await this.prisma.$transaction(async (transaction) => {
      await transaction.apiDocumentation.deleteMany({
        where: {
          scanId,
        },
      });
      await transaction.detectedApi.deleteMany({
        where: {
          scanId,
        },
      });

      if (persistedApis.length > 0) {
        await transaction.detectedApi.createMany({
          data: persistedApis.map(({ api, id }) => ({
            authMetadata: this.toJson(api.authMetadata),
            controllerName: api.controllerName,
            filePath: api.filePath,
            framework: api.framework,
            handlerName: api.handlerName,
            id,
            lineNumber: api.lineNumber,
            method: api.method,
            path: api.path,
            repositoryId,
            requestSchema: this.toJson(api.requestSchema),
            responseSchema: this.toJson(api.responseSchema),
            scanId,
          })),
        });
      }

      if (documentation.length > 0) {
        await transaction.apiDocumentation.createMany({
          data: documentation.map((artifact) => ({
            apiId: artifact.apiId,
            markdown: artifact.markdown,
            openApiJson: artifact.openApiJson,
            repositoryId,
            scanId,
          })),
        });
      }
    });

    return persistedApis;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
