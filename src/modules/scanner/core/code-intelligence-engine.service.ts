import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import { FileDiscoveryService } from './file-discovery.service';
import { FrameworkDetectorService } from '../analyzers/framework-detector.service';
import { LanguageDetectorService } from '../analyzers/language-detector.service';
import { DependencyExtractorService } from '../extractors/dependency-extractor.service';
import { MetadataExtractorService } from '../extractors/metadata-extractor.service';
import { TreeSitterParserService } from '../parsers/tree-sitter-parser.service';
import { CodeIntelligenceRepository } from '../repositories/code-intelligence.repository';
import { assertScannerNotAborted } from '../scanner-abort.util';
import { SCAN_PROGRESS_STAGES } from '../scanner.constants';

import type {
  AnalyzeRepositoryInput,
  CodeIntelligenceResult,
  DiscoveredCodeFile,
  ExtractedCodeFile,
} from '../types/code-intelligence.types';

@Injectable()
export class CodeIntelligenceEngineService {
  constructor(
    private readonly codeIntelligenceRepository: CodeIntelligenceRepository,
    private readonly dependencyExtractor: DependencyExtractorService,
    private readonly fileDiscoveryService: FileDiscoveryService,
    private readonly frameworkDetector: FrameworkDetectorService,
    private readonly languageDetector: LanguageDetectorService,
    private readonly metadataExtractor: MetadataExtractorService,
    private readonly treeSitterParser: TreeSitterParserService,
  ) {}

  async analyzeRepository(input: AnalyzeRepositoryInput): Promise<CodeIntelligenceResult> {
    assertScannerNotAborted(input.abortSignal);
    const discovery = await this.fileDiscoveryService.discover(input.workspace, input.abortSignal);
    await input.onProgress({
      metadata: {
        discoveredFileCount: discovery.files.length,
        ignoredFileCount: discovery.ignoredFiles.length,
      },
      progress: 30,
      stage: SCAN_PROGRESS_STAGES.discoveringFiles,
    });

    const languages = this.languageDetector.detect(discovery.files);
    const frameworks = await this.frameworkDetector.detect(input.workspace, discovery.files);
    assertScannerNotAborted(input.abortSignal);
    const files = await this.extractFiles(discovery.files, input);
    const dependencies = this.dependencyExtractor.extract(files);
    const result: CodeIntelligenceResult = {
      dependencies,
      discovery,
      files,
      frameworks,
      languages,
      parseFailureCount: files.filter((file) => file.parseStatus === 'FAILED').length,
    };

    assertScannerNotAborted(input.abortSignal);
    await this.codeIntelligenceRepository.replaceScanIntelligence(
      input.workspace.repository.id,
      input.scanId,
      result,
    );

    return result;
  }

  private async extractFiles(
    discoveredFiles: DiscoveredCodeFile[],
    input: AnalyzeRepositoryInput,
  ): Promise<ExtractedCodeFile[]> {
    const extractedFiles: ExtractedCodeFile[] = [];
    const progressInterval = Math.max(1, Math.floor(discoveredFiles.length / 10));

    for (const [index, file] of discoveredFiles.entries()) {
      assertScannerNotAborted(input.abortSignal);
      extractedFiles.push(await this.extractFile(file));

      if ((index + 1) % progressInterval === 0 || index + 1 === discoveredFiles.length) {
        await input.onProgress({
          metadata: {
            analyzedFileCount: index + 1,
            totalFileCount: discoveredFiles.length,
          },
          progress: this.getAstProgress(index + 1, discoveredFiles.length),
          stage: SCAN_PROGRESS_STAGES.analyzingAst,
        });
      }
    }

    if (discoveredFiles.length === 0) {
      await input.onProgress({
        metadata: {
          analyzedFileCount: 0,
          totalFileCount: 0,
        },
        progress: 70,
        stage: SCAN_PROGRESS_STAGES.analyzingAst,
      });
    }

    return extractedFiles;
  }

  private async extractFile(file: DiscoveredCodeFile): Promise<ExtractedCodeFile> {
    let sourceCode = '';

    try {
      sourceCode = await readFile(file.absolutePath, 'utf8');
      const parseResult = this.treeSitterParser.parse(file, sourceCode);

      return this.metadataExtractor.extract(file, sourceCode, parseResult);
    } catch {
      return this.metadataExtractor.createFailedFile(
        file,
        sourceCode,
        'Source file could not be parsed.',
      );
    }
  }

  private getAstProgress(analyzedFileCount: number, totalFileCount: number): number {
    if (totalFileCount === 0) {
      return 50;
    }

    return 30 + Math.round((analyzedFileCount / totalFileCount) * 20);
  }
}
