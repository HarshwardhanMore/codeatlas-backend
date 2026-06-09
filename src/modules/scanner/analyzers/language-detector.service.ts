import { Injectable } from '@nestjs/common';
import { CodeLanguage } from '@prisma/client';

import type {
  DiscoveredCodeFile,
  LanguageDetectionResult,
  LanguageStat,
} from '../types/code-intelligence.types';

@Injectable()
export class LanguageDetectorService {
  detect(files: DiscoveredCodeFile[]): LanguageDetectionResult {
    const counts = new Map<CodeLanguage, number>();

    for (const file of files) {
      counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
    }

    const stats = [...counts.entries()]
      .map(
        ([language, fileCount]): LanguageStat => ({
          fileCount,
          language,
          percentage: files.length === 0 ? 0 : Math.round((fileCount / files.length) * 100),
        }),
      )
      .sort((left, right) => right.fileCount - left.fileCount);

    return {
      primaryLanguage: stats[0]?.language ?? CodeLanguage.UNKNOWN,
      stats,
    };
  }
}
