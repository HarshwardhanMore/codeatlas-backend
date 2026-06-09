import { Module } from '@nestjs/common';

import { FrameworkDetectorService } from './analyzers/framework-detector.service';
import { LanguageDetectorService } from './analyzers/language-detector.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiCatalogController } from './api-intelligence/controllers/api-catalog.controller';
import { AuthDiffService } from './api-intelligence/diff/auth-diff.service';
import { SchemaDiffService } from './api-intelligence/diff/schema-diff.service';
import { ApiSourceProjectService } from './api-intelligence/discovery/api-source-project.service';
import { ApiDocumentationGeneratorService } from './api-intelligence/documentation/api-documentation-generator.service';
import { ApiExtractorRegistryService } from './api-intelligence/extractors/api-extractor-registry.service';
import { ExpressExtractor } from './api-intelligence/extractors/express.extractor';
import { NestJsExtractor } from './api-intelligence/extractors/nest-js.extractor';
import { ApiVersioningRepository } from './api-intelligence/history/api-versioning.repository';
import { OpenApiGeneratorService } from './api-intelligence/openapi/openapi-generator.service';
import { ApiCatalogRepository } from './api-intelligence/repositories/api-catalog.repository';
import { ApiIntelligenceRepository } from './api-intelligence/repositories/api-intelligence.repository';
import { ApiRiskService } from './api-intelligence/risk/api-risk.service';
import { SchemaExtractorService } from './api-intelligence/schemas/schema-extractor.service';
import { ApiCatalogService } from './api-intelligence/services/api-catalog.service';
import { ApiIntelligenceEngineService } from './api-intelligence/services/api-intelligence-engine.service';
import { ApiChangeDetectorService } from './api-intelligence/versioning/api-change-detector.service';
import { ApiContractHashService } from './api-intelligence/versioning/api-contract-hash.service';
import { ApiVersioningService } from './api-intelligence/versioning/api-versioning.service';
import { ScannerController } from './controllers/scanner.controller';
import { CodeIntelligenceEngineService } from './core/code-intelligence-engine.service';
import { FileDiscoveryService } from './core/file-discovery.service';
import { DependencyGraphController } from './dependency-graph/dependency-graph.controller';
import { DependencyGraphRepository } from './dependency-graph/dependency-graph.repository';
import { DependencyGraphService } from './dependency-graph/dependency-graph.service';
import { DependencyExtractorService } from './extractors/dependency-extractor.service';
import { MetadataExtractorService } from './extractors/metadata-extractor.service';
import { RepositoryScanLifecycleService } from './lifecycle/repository-scan-lifecycle.service';
import { TreeSitterParserService } from './parsers/tree-sitter-parser.service';
import { CodeIntelligenceRepository } from './repositories/code-intelligence.repository';
import { ScansRepository } from './repositories/scans.repository';
import { ScannerService } from './services/scanner.service';
import { GitCommandRunnerService } from './source/git-command-runner.service';
import { GitSourceMaterializer } from './source/git-source-materializer.service';
import { SourceMaterializerRegistryService } from './source/source-materializer-registry.service';
import { ZipSourceMaterializer } from './source/zip-source-materializer.service';
import { WorkspaceManagerService } from './workspace/workspace-manager.service';
import { RepositoryScanProcessor } from '../jobs/processors/repository-scan.processor';

@Module({
  controllers: [ApiCatalogController, DependencyGraphController, ScannerController],
  imports: [IntegrationsModule, JobsModule, PrismaModule],
  providers: [
    ApiCatalogRepository,
    ApiCatalogService,
    ApiChangeDetectorService,
    ApiContractHashService,
    ApiDocumentationGeneratorService,
    ApiExtractorRegistryService,
    ApiIntelligenceEngineService,
    ApiIntelligenceRepository,
    ApiRiskService,
    ApiSourceProjectService,
    ApiVersioningRepository,
    ApiVersioningService,
    AuthDiffService,
    CodeIntelligenceEngineService,
    CodeIntelligenceRepository,
    DependencyGraphRepository,
    DependencyGraphService,
    DependencyExtractorService,
    ExpressExtractor,
    FileDiscoveryService,
    FrameworkDetectorService,
    GitCommandRunnerService,
    GitSourceMaterializer,
    LanguageDetectorService,
    MetadataExtractorService,
    NestJsExtractor,
    OpenApiGeneratorService,
    RepositoryScanLifecycleService,
    RepositoryScanProcessor,
    SchemaExtractorService,
    ScannerService,
    ScansRepository,
    SchemaDiffService,
    SourceMaterializerRegistryService,
    TreeSitterParserService,
    WorkspaceManagerService,
    ZipSourceMaterializer,
  ],
})
export class ScannerModule {}
