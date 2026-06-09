import type { CodeDependencyKind, CodeLanguage, CodeSymbolKind, Repository } from '@prisma/client';

export interface PreparedRepositoryWorkspace {
  cleanup(): Promise<void>;
  repository: Repository;
  rootPath: string;
  sourcePath: string;
}

export interface DiscoveredCodeFile {
  absolutePath: string;
  extension: string;
  language: CodeLanguage;
  relativePath: string;
  sizeBytes: number;
}

export interface IgnoredCodeFile {
  path: string;
  reason: string;
}

export interface FileDiscoveryResult {
  files: DiscoveredCodeFile[];
  ignoredFiles: IgnoredCodeFile[];
  totalVisitedFiles: number;
}

export interface LanguageStat {
  fileCount: number;
  language: CodeLanguage;
  percentage: number;
}

export interface LanguageDetectionResult {
  primaryLanguage: CodeLanguage;
  stats: LanguageStat[];
}

export interface FrameworkDetection {
  confidence: number;
  evidence: string[];
  framework: 'Express' | 'NestJS' | 'Next.js';
}

export interface TreeSitterParseResult {
  hasError: boolean;
  rootType: string;
}

export interface ExtractedImport {
  line: number;
  moduleSpecifier: string;
  namedImports: string[];
}

export interface ExtractedExport {
  line: number;
  moduleSpecifier: string | null;
  name: string;
}

export interface ExtractedMethodCall {
  expression: string;
  line: number;
}

export interface ExtractedClassRelation {
  className: string;
  extendsName: string;
  line: number;
}

export interface ExtractedCodeSymbol {
  endLine: number | null;
  kind: CodeSymbolKind;
  metadata: Record<string, unknown>;
  name: string;
  qualifiedName: string | null;
  startLine: number | null;
}

export interface ExtractedCodeFile {
  file: DiscoveredCodeFile;
  hash: string;
  imports: ExtractedImport[];
  exports: ExtractedExport[];
  classRelations: ExtractedClassRelation[];
  lineCount: number;
  metadata: Record<string, unknown>;
  methodCalls: ExtractedMethodCall[];
  parseError: string | null;
  parseStatus: 'FAILED' | 'SUCCESS';
  symbols: ExtractedCodeSymbol[];
}

export interface ExtractedCodeDependency {
  kind: CodeDependencyKind;
  metadata: Record<string, unknown>;
  sourcePath: string;
  specifier: string;
  targetPath: string | null;
}

export interface CodeIntelligenceResult {
  dependencies: ExtractedCodeDependency[];
  discovery: FileDiscoveryResult;
  files: ExtractedCodeFile[];
  frameworks: FrameworkDetection[];
  languages: LanguageDetectionResult;
  parseFailureCount: number;
}

export interface CodeIntelligenceProgressUpdate {
  metadata: Record<string, unknown>;
  progress: number;
  stage: string;
}

export interface AnalyzeRepositoryInput {
  abortSignal?: AbortSignal;
  onProgress(update: CodeIntelligenceProgressUpdate): Promise<void>;
  scanId: string;
  workspace: PreparedRepositoryWorkspace;
}
