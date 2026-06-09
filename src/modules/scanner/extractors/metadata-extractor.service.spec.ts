import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { CodeLanguage, CodeSymbolKind } from '@prisma/client';

import { MetadataExtractorService } from './metadata-extractor.service';
import { TreeSitterParserService } from '../parsers/tree-sitter-parser.service';

import type { DiscoveredCodeFile } from '../types/code-intelligence.types';

const fixturePath = path.resolve(
  process.cwd(),
  'fixtures/scanner/typescript-nest/src/users.service.ts',
);
const discoveredFile: DiscoveredCodeFile = {
  absolutePath: fixturePath,
  extension: '.ts',
  language: CodeLanguage.TYPESCRIPT,
  relativePath: 'src/users.service.ts',
  sizeBytes: 500,
};

describe(MetadataExtractorService.name, () => {
  it('extracts symbols, imports, decorators, and method calls from TypeScript source', async () => {
    const sourceCode = await readFile(fixturePath, 'utf8');
    const parser = new TreeSitterParserService();
    const extractor = new MetadataExtractorService();

    const result = extractor.extract(
      discoveredFile,
      sourceCode,
      parser.parse(discoveredFile, sourceCode),
    );
    const symbols = result.symbols.map((symbol) => ({
      kind: symbol.kind,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
    }));

    expect(result.parseStatus).toBe('SUCCESS');
    expect(result.imports.map((importDeclaration) => importDeclaration.moduleSpecifier)).toEqual([
      '@nestjs/common',
      './users.repository',
    ]);
    expect(symbols).toEqual(
      expect.arrayContaining([
        {
          kind: CodeSymbolKind.CLASS,
          name: 'UserService',
          qualifiedName: 'UserService',
        },
        {
          kind: CodeSymbolKind.METHOD,
          name: 'findUser',
          qualifiedName: 'UserService.findUser',
        },
        {
          kind: CodeSymbolKind.INTERFACE,
          name: 'UserDto',
          qualifiedName: 'UserDto',
        },
        {
          kind: CodeSymbolKind.TYPE,
          name: 'UserId',
          qualifiedName: 'UserId',
        },
        {
          kind: CodeSymbolKind.DECORATOR,
          name: 'Injectable',
          qualifiedName: null,
        },
      ]),
    );
    expect(result.classRelations).toEqual([
      {
        className: 'UserService',
        extendsName: 'BaseService',
        line: 13,
      },
    ]);
    expect(result.methodCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expression: 'this.repository.find',
        }),
      ]),
    );
  });
});
