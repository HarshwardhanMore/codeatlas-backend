import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import * as Parser from 'tree-sitter';
import * as javascriptGrammar from 'tree-sitter-javascript';
import * as typescriptGrammars from 'tree-sitter-typescript';

import type { DiscoveredCodeFile, TreeSitterParseResult } from '../types/code-intelligence.types';

@Injectable()
export class TreeSitterParserService {
  parse(file: DiscoveredCodeFile, sourceCode: string): TreeSitterParseResult {
    const parser = new Parser();
    parser.setLanguage(this.getLanguageForFile(file));

    const tree = parser.parse(sourceCode);

    return {
      hasError: tree.rootNode.hasError,
      rootType: tree.rootNode.type,
    };
  }

  private getLanguageForFile(file: DiscoveredCodeFile): unknown {
    const extension = path.extname(file.relativePath).toLowerCase();

    if (extension === '.ts') {
      return typescriptGrammars.typescript;
    }

    if (extension === '.tsx') {
      return typescriptGrammars.tsx;
    }

    return javascriptGrammar;
  }
}
