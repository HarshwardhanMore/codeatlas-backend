import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import type { CodeIntelligenceResult } from '../types/code-intelligence.types';
import type { Prisma } from '@prisma/client';

const CODE_INTELLIGENCE_WRITE_BATCH_SIZE = 1000;

@Injectable()
export class CodeIntelligenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceScanIntelligence(
    repositoryId: string,
    scanId: string,
    result: CodeIntelligenceResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.codeDependency.deleteMany({
        where: {
          scanId,
        },
      });
      await transaction.codeSymbol.deleteMany({
        where: {
          scanId,
        },
      });
      await transaction.codeFile.deleteMany({
        where: {
          scanId,
        },
      });

      if (result.files.length > 0) {
        await this.createManyInBatches(
          result.files.map((file) => ({
            hash: file.hash,
            language: file.file.language,
            lineCount: file.lineCount,
            metadata: this.toJson(file.metadata),
            parseError: file.parseError,
            parseStatus: file.parseStatus,
            path: file.file.relativePath,
            repositoryId,
            scanId,
            sizeBytes: file.file.sizeBytes,
          })),
          (data) =>
            transaction.codeFile.createMany({
              data,
            }),
        );
      }

      const codeFiles = await transaction.codeFile.findMany({
        select: {
          id: true,
          path: true,
        },
        where: {
          scanId,
        },
      });
      const codeFileIdsByPath = new Map(codeFiles.map((file) => [file.path, file.id]));

      const symbols = result.files.flatMap((file) => {
        const codeFileId = codeFileIdsByPath.get(file.file.relativePath);

        if (!codeFileId) {
          return [];
        }

        return file.symbols.map((symbol) => ({
          codeFileId,
          endLine: symbol.endLine,
          kind: symbol.kind,
          metadata: this.toJson(symbol.metadata),
          name: symbol.name,
          qualifiedName: symbol.qualifiedName,
          repositoryId,
          scanId,
          startLine: symbol.startLine,
        }));
      });

      if (symbols.length > 0) {
        await this.createManyInBatches(symbols, (data) =>
          transaction.codeSymbol.createMany({
            data,
          }),
        );
      }

      const dependencies = result.dependencies.flatMap((dependency) => {
        const sourceFileId = codeFileIdsByPath.get(dependency.sourcePath);

        if (!sourceFileId) {
          return [];
        }

        const targetFileId =
          dependency.targetPath === null
            ? null
            : (codeFileIdsByPath.get(dependency.targetPath) ?? null);

        return [
          {
            kind: dependency.kind,
            metadata: this.toJson(dependency.metadata),
            repositoryId,
            scanId,
            sourceFileId,
            sourcePath: dependency.sourcePath,
            specifier: dependency.specifier,
            targetFileId,
            targetPath: dependency.targetPath,
          },
        ];
      });

      if (dependencies.length > 0) {
        await this.createManyInBatches(dependencies, (data) =>
          transaction.codeDependency.createMany({
            data,
          }),
        );
      }
    });
  }

  private async createManyInBatches<TItem>(
    items: TItem[],
    writeBatch: (batch: TItem[]) => Promise<unknown>,
  ): Promise<void> {
    for (let index = 0; index < items.length; index += CODE_INTELLIGENCE_WRITE_BATCH_SIZE) {
      await writeBatch(items.slice(index, index + CODE_INTELLIGENCE_WRITE_BATCH_SIZE));
    }
  }

  private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
