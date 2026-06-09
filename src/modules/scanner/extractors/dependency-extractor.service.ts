import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { CodeDependencyKind } from '@prisma/client';

import type {
  CodeIntelligenceResult,
  ExtractedCodeDependency,
  ExtractedCodeFile,
} from '../types/code-intelligence.types';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;

@Injectable()
export class DependencyExtractorService {
  extract(files: ExtractedCodeFile[]): ExtractedCodeDependency[] {
    const filePaths = new Set(files.map((file) => file.file.relativePath));
    const dependencies: ExtractedCodeDependency[] = [];

    for (const file of files) {
      for (const importDeclaration of file.imports) {
        dependencies.push({
          kind: CodeDependencyKind.IMPORT,
          metadata: {
            line: importDeclaration.line,
            namedImports: importDeclaration.namedImports,
          },
          sourcePath: file.file.relativePath,
          specifier: importDeclaration.moduleSpecifier,
          targetPath: this.resolveRelativeSpecifier(
            file.file.relativePath,
            importDeclaration.moduleSpecifier,
            filePaths,
          ),
        });
      }

      for (const exportDeclaration of file.exports) {
        if (!exportDeclaration.moduleSpecifier) {
          continue;
        }

        dependencies.push({
          kind: CodeDependencyKind.EXPORT,
          metadata: {
            line: exportDeclaration.line,
            name: exportDeclaration.name,
          },
          sourcePath: file.file.relativePath,
          specifier: exportDeclaration.moduleSpecifier,
          targetPath: this.resolveRelativeSpecifier(
            file.file.relativePath,
            exportDeclaration.moduleSpecifier,
            filePaths,
          ),
        });
      }

      for (const relation of file.classRelations) {
        dependencies.push({
          kind: CodeDependencyKind.CLASS_EXTENDS,
          metadata: {
            className: relation.className,
            line: relation.line,
          },
          sourcePath: file.file.relativePath,
          specifier: relation.extendsName,
          targetPath: null,
        });
      }

      for (const methodCall of file.methodCalls) {
        dependencies.push({
          kind: CodeDependencyKind.METHOD_CALL,
          metadata: {
            line: methodCall.line,
          },
          sourcePath: file.file.relativePath,
          specifier: methodCall.expression,
          targetPath: null,
        });
      }
    }

    return dependencies;
  }

  getDependencyCountByKind(
    dependencies: CodeIntelligenceResult['dependencies'],
  ): Record<string, number> {
    return dependencies.reduce<Record<string, number>>((counts, dependency) => {
      counts[dependency.kind] = (counts[dependency.kind] ?? 0) + 1;
      return counts;
    }, {});
  }

  private resolveRelativeSpecifier(
    sourcePath: string,
    moduleSpecifier: string,
    filePaths: Set<string>,
  ): string | null {
    if (!moduleSpecifier.startsWith('.')) {
      return null;
    }

    const sourceDirectory = path.posix.dirname(sourcePath);
    const normalizedBase = path.posix.normalize(path.posix.join(sourceDirectory, moduleSpecifier));
    const candidates = this.getSpecifierCandidates(normalizedBase);

    return candidates.find((candidate) => filePaths.has(candidate)) ?? null;
  }

  private getSpecifierCandidates(normalizedBase: string): string[] {
    const extension = path.posix.extname(normalizedBase);

    if (extension) {
      return [normalizedBase];
    }

    return [
      ...RESOLVABLE_EXTENSIONS.map(
        (candidateExtension) => `${normalizedBase}${candidateExtension}`,
      ),
      ...RESOLVABLE_EXTENSIONS.map(
        (candidateExtension) => `${normalizedBase}/index${candidateExtension}`,
      ),
    ];
  }
}
