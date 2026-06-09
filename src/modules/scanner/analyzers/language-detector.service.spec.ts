import { CodeLanguage } from '@prisma/client';

import { LanguageDetectorService } from './language-detector.service';

import type { DiscoveredCodeFile } from '../types/code-intelligence.types';

function createFile(relativePath: string, language: CodeLanguage): DiscoveredCodeFile {
  return {
    absolutePath: `/repo/${relativePath}`,
    extension: relativePath.slice(relativePath.lastIndexOf('.')),
    language,
    relativePath,
    sizeBytes: 100,
  };
}

describe(LanguageDetectorService.name, () => {
  it('returns the primary language and language percentages', () => {
    const service = new LanguageDetectorService();

    const result = service.detect([
      createFile('src/app.ts', CodeLanguage.TYPESCRIPT),
      createFile('src/service.ts', CodeLanguage.TYPESCRIPT),
      createFile('src/client.js', CodeLanguage.JAVASCRIPT),
    ]);

    expect(result.primaryLanguage).toBe(CodeLanguage.TYPESCRIPT);
    expect(result.stats).toEqual([
      {
        fileCount: 2,
        language: CodeLanguage.TYPESCRIPT,
        percentage: 67,
      },
      {
        fileCount: 1,
        language: CodeLanguage.JAVASCRIPT,
        percentage: 33,
      },
    ]);
  });
});
