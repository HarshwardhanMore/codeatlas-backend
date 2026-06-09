import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';
import { Project, ScriptKind } from 'ts-morph';

import type {
  CodeIntelligenceResult,
  ExtractedCodeFile,
} from '../../types/code-intelligence.types';
import type { ApiExtractionSourceProject } from '../types/api-intelligence.types';

@Injectable()
export class ApiSourceProjectService {
  async createSourceProject(
    codeIntelligence: CodeIntelligenceResult,
  ): Promise<ApiExtractionSourceProject> {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    const codeFileByPath = new Map<string, ExtractedCodeFile>();

    for (const codeFile of codeIntelligence.files) {
      if (codeFile.parseStatus !== 'SUCCESS') {
        continue;
      }

      const sourceCode = await readFile(codeFile.file.absolutePath, 'utf8');
      project.createSourceFile(codeFile.file.relativePath, sourceCode, {
        overwrite: true,
        scriptKind: this.getScriptKind(codeFile.file.extension),
      });
      codeFileByPath.set(codeFile.file.relativePath, codeFile);
    }

    return {
      codeFileByPath,
      sourceFiles: project.getSourceFiles(),
    };
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
}
