import { Injectable } from '@nestjs/common';
import { ScanStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { CodeDependency, CodeFile, Repository, ScanJob } from '@prisma/client';

export type CodeDependencyWithFiles = CodeDependency & {
  sourceFile: Pick<CodeFile, 'id' | 'language' | 'path'>;
  targetFile: Pick<CodeFile, 'id' | 'language' | 'path'> | null;
};

const DEPENDENCY_GRAPH_EDGE_LIMIT = 2000;

@Injectable()
export class DependencyGraphRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRepositoryForUser(repositoryId: string, userId: string): Promise<Repository | null> {
    return this.prisma.repository.findFirst({
      where: {
        id: repositoryId,
        ownerId: userId,
      },
    });
  }

  findLatestCompletedScan(repositoryId: string): Promise<ScanJob | null> {
    return this.prisma.scanJob.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        repositoryId,
        status: ScanStatus.COMPLETED,
      },
    });
  }

  listDependenciesForScan(
    repositoryId: string,
    scanId: string,
  ): Promise<CodeDependencyWithFiles[]> {
    return this.prisma.codeDependency.findMany({
      include: {
        sourceFile: {
          select: {
            id: true,
            language: true,
            path: true,
          },
        },
        targetFile: {
          select: {
            id: true,
            language: true,
            path: true,
          },
        },
      },
      orderBy: [
        {
          sourcePath: 'asc',
        },
        {
          specifier: 'asc',
        },
      ],
      take: DEPENDENCY_GRAPH_EDGE_LIMIT,
      where: {
        repositoryId,
        scanId,
      },
    });
  }
}
