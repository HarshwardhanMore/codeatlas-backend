import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHttpMethod } from '@prisma/client';

import { AiConversationsRepository } from '../repositories/ai-conversations.repository';

import type {
  AiApiChangeContext,
  AiDetectedApiContext,
  AiRepositoryIntelligenceContext,
  BuiltAiContext,
} from './ai-context.types';
import type { RepositoryContextSearchInput } from '../repositories/ai-conversations.repository';
import type { CodeDependency, CodeFile, CodeSymbol, Prisma } from '@prisma/client';

interface ContextSection {
  content: string;
  title: string;
}

const APPROX_CHARS_PER_TOKEN = 4;
const JSON_VALUE_PREVIEW_CHARS = 900;
const MARKDOWN_PREVIEW_CHARS = 1000;
const MAX_CONTEXT_APIS = 30;
const MAX_CONTEXT_CHANGES = 20;
const MAX_CONTEXT_DEPENDENCIES = 50;
const MAX_CONTEXT_FILES = 60;
const MAX_CONTEXT_SYMBOLS = 70;

@Injectable()
export class AiContextBuilderService {
  private readonly maxContextCharacters: number;

  constructor(
    private readonly aiConversationsRepository: AiConversationsRepository,
    configService: ConfigService,
  ) {
    this.maxContextCharacters =
      configService.getOrThrow<number>('ai.maxContextTokens') * APPROX_CHARS_PER_TOKEN;
  }

  async buildContext(
    userId: string,
    repositoryId: string,
    question: string,
  ): Promise<BuiltAiContext> {
    const terms = this.getQuestionTerms(question);
    const data = await this.aiConversationsRepository.findRepositoryContext(
      repositoryId,
      userId,
      this.createRepositoryContextSearch(question, terms),
    );

    if (!data) {
      throw new NotFoundException('Repository was not found.');
    }

    const sections = this.createSections(data, question, terms);

    return {
      contextText: this.joinSectionsWithinBudget(sections),
      stats: {
        apiCount: data.apis.length,
        changeCount: data.apiChanges.length,
        dependencyCount: data.codeDependencies.length,
        fileCount: data.codeFiles.length,
        symbolCount: data.codeSymbols.length,
      },
    };
  }

  private createSections(
    data: AiRepositoryIntelligenceContext,
    question: string,
    terms: Set<string>,
  ): ContextSection[] {
    const sections: ContextSection[] = [
      {
        content: this.buildRepositorySection(data),
        title: 'Repository',
      },
      {
        content: this.buildApisSection(this.rankApis(data.apis, question, terms)),
        title: 'Detected APIs',
      },
      {
        content: this.buildChangesSection(data.apiChanges),
        title: 'Recent API Changes',
      },
      {
        content: this.buildFilesSection(this.rankFiles(data.codeFiles, terms)),
        title: 'Code Files',
      },
      {
        content: this.buildSymbolsSection(this.rankSymbols(data.codeSymbols, terms)),
        title: 'Code Symbols',
      },
      {
        content: this.buildDependenciesSection(this.rankDependencies(data.codeDependencies, terms)),
        title: 'Code Dependencies',
      },
    ];

    return sections.filter((section) => section.content.length > 0);
  }

  private buildRepositorySection(data: AiRepositoryIntelligenceContext): string {
    const repository = data.repository;
    const latestScan = data.latestScan;

    return [
      `Repository: ${repository.fullName}`,
      `Provider: ${repository.provider}`,
      `Default branch: ${repository.defaultBranch ?? 'unknown'}`,
      `Language metadata: ${repository.language ?? 'unknown'}`,
      `Visibility: ${repository.visibility ?? 'unknown'}`,
      latestScan
        ? `Latest scan: ${latestScan.id} / ${latestScan.status} / ${latestScan.createdAt.toISOString()}`
        : 'Latest scan: unavailable',
      latestScan?.metadata
        ? `Latest scan metadata: ${this.previewJson(latestScan.metadata)}`
        : 'Latest scan metadata: unavailable',
    ].join('\n');
  }

  private buildApisSection(apis: AiDetectedApiContext[]): string {
    return apis
      .slice(0, MAX_CONTEXT_APIS)
      .map((api) =>
        [
          `${api.method} ${api.path}`,
          `Framework: ${api.framework}`,
          `Source: ${api.filePath}:${api.lineNumber.toString()}`,
          `Handler: ${api.controllerName ?? 'unknown'}.${api.handlerName ?? 'unknown'}`,
          `Auth: ${this.previewJson(api.authMetadata)}`,
          `Request: ${this.previewJson(api.requestSchema)}`,
          `Response: ${this.previewJson(api.responseSchema)}`,
          api.apiDocumentation?.markdown
            ? `Documentation: ${this.truncate(api.apiDocumentation.markdown, MARKDOWN_PREVIEW_CHARS)}`
            : 'Documentation: unavailable',
        ].join('\n'),
      )
      .join('\n\n');
  }

  private buildChangesSection(changes: AiApiChangeContext[]): string {
    return changes
      .slice(0, MAX_CONTEXT_CHANGES)
      .map((change) =>
        [
          `${change.changeType} / ${change.severity} / ${change.createdAt.toISOString()}`,
          `API id: ${change.apiId}`,
          `Description: ${change.description}`,
          `Metadata: ${this.previewJson(change.metadata)}`,
          change.oldSnapshot
            ? `Before snapshot v${change.oldSnapshot.version.toString()}: ${this.previewJson(
                change.oldSnapshot.schemaJson,
              )}`
            : 'Before snapshot: unavailable',
          change.newSnapshot
            ? `After snapshot v${change.newSnapshot.version.toString()}: ${this.previewJson(
                change.newSnapshot.schemaJson,
              )}`
            : 'After snapshot: unavailable',
        ].join('\n'),
      )
      .join('\n\n');
  }

  private buildFilesSection(files: CodeFile[]): string {
    return files
      .slice(0, MAX_CONTEXT_FILES)
      .map(
        (file) =>
          `${file.path} / ${file.language} / ${file.lineCount.toString()} lines / ${file.parseStatus}`,
      )
      .join('\n');
  }

  private buildSymbolsSection(symbols: CodeSymbol[]): string {
    return symbols
      .slice(0, MAX_CONTEXT_SYMBOLS)
      .map((symbol) =>
        [
          `${symbol.kind}: ${symbol.qualifiedName ?? symbol.name}`,
          `File id: ${symbol.codeFileId}`,
          `Lines: ${symbol.startLine?.toString() ?? '?'}-${symbol.endLine?.toString() ?? '?'}`,
          `Metadata: ${this.previewJson(symbol.metadata)}`,
        ].join(' / '),
      )
      .join('\n');
  }

  private buildDependenciesSection(dependencies: CodeDependency[]): string {
    return dependencies
      .slice(0, MAX_CONTEXT_DEPENDENCIES)
      .map(
        (dependency) =>
          `${dependency.sourcePath} -> ${dependency.targetPath ?? dependency.specifier} / ${dependency.kind}`,
      )
      .join('\n');
  }

  private rankApis(
    apis: AiDetectedApiContext[],
    question: string,
    terms: Set<string>,
  ): AiDetectedApiContext[] {
    const methodPathMatch = /\b(GET|POST|PUT|PATCH|DELETE)\s+([/\w:.-]+)/i.exec(question);
    const requestedMethod = methodPathMatch?.[1]?.toUpperCase() ?? null;
    const requestedPath = methodPathMatch?.[2] ?? null;

    return [...apis].sort((left, right) => {
      const leftScore = this.scoreApi(left, terms, requestedMethod, requestedPath);
      const rightScore = this.scoreApi(right, terms, requestedMethod, requestedPath);

      return rightScore - leftScore;
    });
  }

  private scoreApi(
    api: AiDetectedApiContext,
    terms: Set<string>,
    requestedMethod: string | null,
    requestedPath: string | null,
  ): number {
    let score = 0;

    if (requestedMethod && api.method === requestedMethod) {
      score += 10;
    }

    if (requestedPath && api.path.includes(requestedPath)) {
      score += 20;
    }

    const haystack = [
      api.path,
      api.controllerName ?? '',
      api.handlerName ?? '',
      api.filePath,
      api.framework,
    ]
      .join(' ')
      .toLowerCase();

    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
      }
    }

    return score;
  }

  private rankFiles(files: CodeFile[], terms: Set<string>): CodeFile[] {
    return [...files].sort(
      (left, right) => this.scoreText(right.path, terms) - this.scoreText(left.path, terms),
    );
  }

  private rankSymbols(symbols: CodeSymbol[], terms: Set<string>): CodeSymbol[] {
    return [...symbols].sort((left, right) => {
      const leftText = `${left.name} ${left.qualifiedName ?? ''} ${this.previewJson(left.metadata)}`;
      const rightText = `${right.name} ${right.qualifiedName ?? ''} ${this.previewJson(right.metadata)}`;

      return this.scoreText(rightText, terms) - this.scoreText(leftText, terms);
    });
  }

  private rankDependencies(dependencies: CodeDependency[], terms: Set<string>): CodeDependency[] {
    return [...dependencies].sort((left, right) => {
      const leftText = `${left.sourcePath} ${left.targetPath ?? ''} ${left.specifier}`;
      const rightText = `${right.sourcePath} ${right.targetPath ?? ''} ${right.specifier}`;

      return this.scoreText(rightText, terms) - this.scoreText(leftText, terms);
    });
  }

  private scoreText(value: string, terms: Set<string>): number {
    const normalizedValue = value.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (normalizedValue.includes(term)) {
        score += 1;
      }
    }

    return score;
  }

  private joinSectionsWithinBudget(sections: ContextSection[]): string {
    const selectedSections: string[] = [];
    let usedCharacters = 0;

    for (const section of sections) {
      const renderedSection = `## ${section.title}\n${section.content}`;
      const nextLength = renderedSection.length + 2;

      if (usedCharacters + nextLength > this.maxContextCharacters) {
        const remainingCharacters = this.maxContextCharacters - usedCharacters - 2;

        if (remainingCharacters > 200) {
          selectedSections.push(this.truncate(renderedSection, remainingCharacters));
        }

        break;
      }

      selectedSections.push(renderedSection);
      usedCharacters += nextLength;
    }

    return selectedSections.join('\n\n');
  }

  private getQuestionTerms(question: string): Set<string> {
    const normalizedQuestion = question.toLowerCase();
    const terms = [
      ...normalizedQuestion.split(/[^a-z0-9_/:.-]+/),
      ...normalizedQuestion.split(/[^a-z0-9_]+/),
    ];

    return new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 3));
  }

  private createRepositoryContextSearch(
    question: string,
    terms: Set<string>,
  ): RepositoryContextSearchInput {
    const requestedEndpoint = this.extractRequestedEndpoint(question);

    return {
      endpointPath: requestedEndpoint?.path,
      httpMethod: requestedEndpoint?.method,
      terms: [...terms].slice(0, 12),
    };
  }

  private extractRequestedEndpoint(
    question: string,
  ): { method: ApiHttpMethod; path: string } | null {
    const methodPathMatch = /\b(GET|POST|PUT|PATCH|DELETE)\s+([/\w:.-]+)/i.exec(question);
    const method = methodPathMatch?.[1]?.toUpperCase();
    const requestedPath = methodPathMatch?.[2];

    if (!method || !requestedPath || !this.isApiHttpMethod(method)) {
      return null;
    }

    return {
      method,
      path: requestedPath,
    };
  }

  private isApiHttpMethod(method: string): method is ApiHttpMethod {
    return Object.values(ApiHttpMethod).includes(method as ApiHttpMethod);
  }

  private previewJson(value: Prisma.JsonValue | null): string {
    if (value === null) {
      return 'null';
    }

    try {
      return this.truncate(JSON.stringify(value), JSON_VALUE_PREVIEW_CHARS);
    } catch {
      return '[unserializable]';
    }
  }

  private truncate(value: string, maxCharacters: number): string {
    if (value.length <= maxCharacters) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxCharacters - 14))}...[truncated]`;
  }
}
