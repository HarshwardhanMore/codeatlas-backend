import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { CodeSymbolKind } from '@prisma/client';
import { Project, ScriptKind, SyntaxKind, type ClassDeclaration, type SourceFile } from 'ts-morph';

import type {
  DiscoveredCodeFile,
  ExtractedClassRelation,
  ExtractedCodeFile,
  ExtractedCodeSymbol,
  ExtractedExport,
  ExtractedImport,
  ExtractedMethodCall,
  TreeSitterParseResult,
} from '../types/code-intelligence.types';

const MAX_METHOD_CALLS_PER_FILE = 250;

@Injectable()
export class MetadataExtractorService {
  extract(
    file: DiscoveredCodeFile,
    sourceCode: string,
    parseResult: TreeSitterParseResult,
  ): ExtractedCodeFile {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    const sourceFile = project.createSourceFile(file.relativePath, sourceCode, {
      overwrite: true,
      scriptKind: this.getScriptKind(file.extension),
    });
    const imports = this.extractImports(sourceFile);
    const exports = this.extractExports(sourceFile);
    const symbols = this.extractSymbols(sourceFile, imports, exports);
    const classRelations = this.extractClassRelations(sourceFile);
    const methodCalls = this.extractMethodCalls(sourceFile);

    return {
      classRelations,
      exports,
      file,
      hash: createHash('sha256').update(sourceCode).digest('hex'),
      imports,
      lineCount: sourceCode.split(/\r\n|\r|\n/).length,
      metadata: {
        treeSitter: parseResult,
      },
      methodCalls,
      parseError: parseResult.hasError ? 'Tree-sitter reported syntax errors.' : null,
      parseStatus: parseResult.hasError ? 'FAILED' : 'SUCCESS',
      symbols,
    };
  }

  createFailedFile(
    file: DiscoveredCodeFile,
    sourceCode: string,
    parseError: string,
  ): ExtractedCodeFile {
    return {
      classRelations: [],
      exports: [],
      file,
      hash: createHash('sha256').update(sourceCode).digest('hex'),
      imports: [],
      lineCount: sourceCode.length === 0 ? 0 : sourceCode.split(/\r\n|\r|\n/).length,
      metadata: {},
      methodCalls: [],
      parseError,
      parseStatus: 'FAILED',
      symbols: [],
    };
  }

  private extractImports(sourceFile: SourceFile): ExtractedImport[] {
    return sourceFile.getImportDeclarations().map((declaration) => ({
      line: declaration.getStartLineNumber(),
      moduleSpecifier: declaration.getModuleSpecifierValue(),
      namedImports: declaration.getNamedImports().map((namedImport) => namedImport.getName()),
    }));
  }

  private extractExports(sourceFile: SourceFile): ExtractedExport[] {
    const exports: ExtractedExport[] = [];

    for (const declaration of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = declaration.getModuleSpecifierValue() ?? null;
      const namedExports = declaration
        .getNamedExports()
        .map((namedExport) => namedExport.getName());

      if (namedExports.length === 0 && moduleSpecifier) {
        exports.push({
          line: declaration.getStartLineNumber(),
          moduleSpecifier,
          name: '*',
        });
        continue;
      }

      for (const name of namedExports) {
        exports.push({
          line: declaration.getStartLineNumber(),
          moduleSpecifier,
          name,
        });
      }
    }

    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      const declaration = declarations[0];

      exports.push({
        line: declaration?.getStartLineNumber() ?? 1,
        moduleSpecifier: null,
        name,
      });
    }

    return this.uniqueExports(exports);
  }

  private extractSymbols(
    sourceFile: SourceFile,
    imports: ExtractedImport[],
    exports: ExtractedExport[],
  ): ExtractedCodeSymbol[] {
    const symbols: ExtractedCodeSymbol[] = [];

    for (const importDeclaration of imports) {
      symbols.push({
        endLine: importDeclaration.line,
        kind: CodeSymbolKind.IMPORT,
        metadata: {
          namedImports: importDeclaration.namedImports,
        },
        name: importDeclaration.moduleSpecifier,
        qualifiedName: null,
        startLine: importDeclaration.line,
      });
    }

    for (const exportDeclaration of exports) {
      symbols.push({
        endLine: exportDeclaration.line,
        kind: CodeSymbolKind.EXPORT,
        metadata: {
          moduleSpecifier: exportDeclaration.moduleSpecifier,
        },
        name: exportDeclaration.name,
        qualifiedName: null,
        startLine: exportDeclaration.line,
      });
    }

    for (const classDeclaration of sourceFile.getClasses()) {
      const className = classDeclaration.getName() ?? '<anonymous-class>';
      const decorators = classDeclaration.getDecorators().map((decorator) => decorator.getName());

      symbols.push({
        endLine: classDeclaration.getEndLineNumber(),
        kind: CodeSymbolKind.CLASS,
        metadata: {
          decorators,
          extends: classDeclaration.getExtends()?.getText() ?? null,
        },
        name: className,
        qualifiedName: className,
        startLine: classDeclaration.getStartLineNumber(),
      });

      this.addDecoratorSymbols(symbols, decorators, classDeclaration);
      this.addMethodSymbols(symbols, classDeclaration, className);
    }

    for (const functionDeclaration of sourceFile.getFunctions()) {
      const functionName = functionDeclaration.getName() ?? '<anonymous-function>';

      symbols.push({
        endLine: functionDeclaration.getEndLineNumber(),
        kind: CodeSymbolKind.FUNCTION,
        metadata: {
          isAsync: functionDeclaration.isAsync(),
          isExported: functionDeclaration.isExported(),
        },
        name: functionName,
        qualifiedName: functionName,
        startLine: functionDeclaration.getStartLineNumber(),
      });
    }

    for (const interfaceDeclaration of sourceFile.getInterfaces()) {
      symbols.push({
        endLine: interfaceDeclaration.getEndLineNumber(),
        kind: CodeSymbolKind.INTERFACE,
        metadata: {
          isExported: interfaceDeclaration.isExported(),
        },
        name: interfaceDeclaration.getName(),
        qualifiedName: interfaceDeclaration.getName(),
        startLine: interfaceDeclaration.getStartLineNumber(),
      });
    }

    for (const typeAlias of sourceFile.getTypeAliases()) {
      symbols.push({
        endLine: typeAlias.getEndLineNumber(),
        kind: CodeSymbolKind.TYPE,
        metadata: {
          isExported: typeAlias.isExported(),
        },
        name: typeAlias.getName(),
        qualifiedName: typeAlias.getName(),
        startLine: typeAlias.getStartLineNumber(),
      });
    }

    for (const variableDeclaration of sourceFile.getVariableDeclarations()) {
      symbols.push({
        endLine: variableDeclaration.getEndLineNumber(),
        kind: CodeSymbolKind.VARIABLE,
        metadata: {},
        name: variableDeclaration.getName(),
        qualifiedName: variableDeclaration.getName(),
        startLine: variableDeclaration.getStartLineNumber(),
      });
    }

    return symbols;
  }

  private addMethodSymbols(
    symbols: ExtractedCodeSymbol[],
    classDeclaration: ClassDeclaration,
    className: string,
  ): void {
    for (const methodDeclaration of classDeclaration.getMethods()) {
      const methodName = methodDeclaration.getName();

      symbols.push({
        endLine: methodDeclaration.getEndLineNumber(),
        kind: CodeSymbolKind.METHOD,
        metadata: {
          isAsync: methodDeclaration.isAsync(),
          isStatic: methodDeclaration.isStatic(),
        },
        name: methodName,
        qualifiedName: `${className}.${methodName}`,
        startLine: methodDeclaration.getStartLineNumber(),
      });
    }
  }

  private addDecoratorSymbols(
    symbols: ExtractedCodeSymbol[],
    decorators: string[],
    classDeclaration: ClassDeclaration,
  ): void {
    for (const decoratorName of decorators) {
      symbols.push({
        endLine: classDeclaration.getStartLineNumber(),
        kind: CodeSymbolKind.DECORATOR,
        metadata: {
          target: classDeclaration.getName() ?? '<anonymous-class>',
        },
        name: decoratorName,
        qualifiedName: null,
        startLine: classDeclaration.getStartLineNumber(),
      });
    }
  }

  private extractClassRelations(sourceFile: SourceFile): ExtractedClassRelation[] {
    return sourceFile
      .getClasses()
      .map((classDeclaration) => {
        const className = classDeclaration.getName();
        const extendsName = classDeclaration.getExtends()?.getText();

        if (!className || !extendsName) {
          return null;
        }

        return {
          className,
          extendsName,
          line: classDeclaration.getStartLineNumber(),
        };
      })
      .filter((relation): relation is ExtractedClassRelation => relation !== null);
  }

  private extractMethodCalls(sourceFile: SourceFile): ExtractedMethodCall[] {
    return sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .slice(0, MAX_METHOD_CALLS_PER_FILE)
      .map((callExpression) => ({
        expression: callExpression.getExpression().getText(),
        line: callExpression.getStartLineNumber(),
      }));
  }

  private getScriptKind(extension: string): ScriptKind {
    if (extension === '.tsx') {
      return ScriptKind.TSX;
    }

    if (extension === '.jsx') {
      return ScriptKind.JSX;
    }

    if (extension === '.js') {
      return ScriptKind.JS;
    }

    return ScriptKind.TS;
  }

  private uniqueExports(exports: ExtractedExport[]): ExtractedExport[] {
    const seen = new Set<string>();

    return exports.filter((exportDeclaration) => {
      const key = [
        exportDeclaration.line,
        exportDeclaration.moduleSpecifier ?? '',
        exportDeclaration.name,
      ].join(':');

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }
}
