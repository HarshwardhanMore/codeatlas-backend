import { Injectable } from '@nestjs/common';

import { assertScannerNotAborted } from '../../scanner-abort.util';
import { SCAN_PROGRESS_STAGES } from '../../scanner.constants';
import { ApiSourceProjectService } from '../discovery/api-source-project.service';
import { ApiDocumentationGeneratorService } from '../documentation/api-documentation-generator.service';
import { ApiExtractorRegistryService } from '../extractors/api-extractor-registry.service';
import { OpenApiGeneratorService } from '../openapi/openapi-generator.service';
import { ApiIntelligenceRepository } from '../repositories/api-intelligence.repository';
import { ApiVersioningService } from '../versioning/api-versioning.service';

import type {
  ApiExtractionContext,
  ApiIntelligenceResult,
  DiscoverApisInput,
} from '../types/api-intelligence.types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ApiIntelligenceEngineService {
  constructor(
    private readonly apiDocumentationGenerator: ApiDocumentationGeneratorService,
    private readonly apiExtractorRegistry: ApiExtractorRegistryService,
    private readonly apiIntelligenceRepository: ApiIntelligenceRepository,
    private readonly apiSourceProjectService: ApiSourceProjectService,
    private readonly apiVersioningService: ApiVersioningService,
    private readonly openApiGenerator: OpenApiGeneratorService,
  ) {}

  async discoverApis(input: DiscoverApisInput): Promise<ApiIntelligenceResult> {
    assertScannerNotAborted(input.abortSignal);
    const sourceProject = await this.apiSourceProjectService.createSourceProject(
      input.codeIntelligence,
    );
    const context: ApiExtractionContext = {
      codeIntelligence: input.codeIntelligence,
      sourceProject,
      workspace: input.workspace,
    };
    const extractors = this.apiExtractorRegistry.getSupportedExtractors(context);
    assertScannerNotAborted(input.abortSignal);
    const routeGroups = await Promise.all(
      extractors.map((extractor) => extractor.extractRoutes(context)),
    );
    const apis = routeGroups.flat();

    await input.onProgress({
      metadata: {
        apiCount: apis.length,
        extractorCount: extractors.length,
      },
      progress: 75,
      stage: SCAN_PROGRESS_STAGES.discoveringApis,
    });

    assertScannerNotAborted(input.abortSignal);
    const extractorMetadata = await Promise.all(
      extractors.map((extractor) => extractor.extractMetadata(context)),
    );
    assertScannerNotAborted(input.abortSignal);
    const persistedApis = await this.apiIntelligenceRepository.replaceScanApis(
      input.workspace.repository.id,
      input.scanId,
      apis,
      (persistedApi) => ({
        apiId: persistedApi.id,
        markdown: this.apiDocumentationGenerator.generateMarkdown(persistedApi.api),
        openApiJson: this.openApiGenerator.generateRouteDocument(
          persistedApi.api,
        ) as unknown as Prisma.InputJsonValue,
      }),
    );

    await input.onProgress({
      metadata: {
        apiCount: apis.length,
        documentationCount: persistedApis.length,
      },
      progress: 90,
      stage: SCAN_PROGRESS_STAGES.generatingDocumentation,
    });

    assertScannerNotAborted(input.abortSignal);
    const versioningResult = await this.apiVersioningService.createSnapshotsAndChanges(
      input.workspace.repository.id,
      input.scanId,
      persistedApis,
    );

    await input.onProgress({
      metadata: {
        changeCount: versioningResult.changeCount,
        snapshotCount: versioningResult.snapshotCount,
      },
      progress: 95,
      stage: SCAN_PROGRESS_STAGES.generatingApiChangeReport,
    });

    return {
      apis,
      changeCount: versioningResult.changeCount,
      documentationCount: persistedApis.length,
      extractorMetadata,
      snapshotCount: versioningResult.snapshotCount,
    };
  }
}
