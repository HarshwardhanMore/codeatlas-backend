import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
  DiscoveredCodeFile,
  FrameworkDetection,
  PreparedRepositoryWorkspace,
} from '../types/code-intelligence.types';

interface PackageJsonSubset {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_IMPORT_SCAN_LIMIT = 200;

@Injectable()
export class FrameworkDetectorService {
  async detect(
    workspace: PreparedRepositoryWorkspace,
    files: DiscoveredCodeFile[],
  ): Promise<FrameworkDetection[]> {
    const packageJson = await this.readPackageJson(workspace.sourcePath);
    const packageNames = this.getPackageNames(packageJson);
    const filePatterns = files.map((file) => file.relativePath);
    const importEvidence = await this.collectImportEvidence(files);
    const detections: FrameworkDetection[] = [];

    this.pushDetection(detections, 'NestJS', [
      packageNames.has('@nestjs/common') ? 'package:@nestjs/common' : null,
      importEvidence.some((value) => value.includes('@nestjs/')) ? 'import:@nestjs/*' : null,
      filePatterns.some((value) => value.endsWith('.module.ts')) ? 'pattern:*.module.ts' : null,
      filePatterns.some((value) => value.endsWith('.controller.ts'))
        ? 'pattern:*.controller.ts'
        : null,
    ]);

    this.pushDetection(detections, 'Express', [
      packageNames.has('express') ? 'package:express' : null,
      importEvidence.includes('express') ? 'import:express' : null,
    ]);

    this.pushDetection(detections, 'Next.js', [
      packageNames.has('next') ? 'package:next' : null,
      filePatterns.includes('next.config.ts') || filePatterns.includes('next.config.js')
        ? 'pattern:next.config'
        : null,
      filePatterns.some((value) => value.startsWith('app/') || value.startsWith('pages/'))
        ? 'pattern:app-or-pages-router'
        : null,
    ]);

    return detections.sort((left, right) => right.confidence - left.confidence);
  }

  private async readPackageJson(rootPath: string): Promise<PackageJsonSubset | null> {
    try {
      const packageJsonPath = path.join(rootPath, 'package.json');
      const payload = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;

      if (!this.isPackageJsonSubset(payload)) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  private getPackageNames(packageJson: PackageJsonSubset | null): Set<string> {
    return new Set([
      ...Object.keys(packageJson?.dependencies ?? {}),
      ...Object.keys(packageJson?.devDependencies ?? {}),
    ]);
  }

  private async collectImportEvidence(files: DiscoveredCodeFile[]): Promise<string[]> {
    const imports = new Set<string>();

    for (const file of files.slice(0, FRAMEWORK_IMPORT_SCAN_LIMIT)) {
      const contents = await readFile(file.absolutePath, 'utf8');

      for (const match of contents.matchAll(
        /from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g,
      )) {
        const [, fromImport, requireImport] = match;
        const specifier = fromImport ?? requireImport;

        if (specifier) {
          imports.add(specifier);
        }
      }
    }

    return [...imports];
  }

  private pushDetection(
    detections: FrameworkDetection[],
    framework: FrameworkDetection['framework'],
    evidenceCandidates: (string | null)[],
  ): void {
    const evidence = evidenceCandidates.filter((value): value is string => Boolean(value));

    if (evidence.length === 0) {
      return;
    }

    detections.push({
      confidence: Math.min(95, 50 + evidence.length * 15),
      evidence,
      framework,
    });
  }

  private isPackageJsonSubset(value: unknown): value is PackageJsonSubset {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;

    return (
      this.isDependencyRecord(record['dependencies']) ||
      this.isDependencyRecord(record['devDependencies'])
    );
  }

  private isDependencyRecord(value: unknown): value is Record<string, string> {
    if (value === undefined) {
      return true;
    }

    if (typeof value !== 'object' || value === null) {
      return false;
    }

    return Object.values(value).every((dependencyVersion) => typeof dependencyVersion === 'string');
  }
}
