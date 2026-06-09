import { Injectable } from '@nestjs/common';
import { AiMessageRole, ScanStatus, type ApiHttpMethod, type Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { AiRepositoryIntelligenceContext } from '../context/ai-context.types';

export type AiConversationWithMessages = Prisma.AiConversationGetPayload<{
  include: {
    messages: {
      orderBy: {
        createdAt: 'asc';
      };
    };
    repository: true;
  };
}>;

export interface CreateConversationInput {
  model: string;
  repositoryId: string;
  title: string;
  userId: string;
}

export interface CreateMessageInput {
  content: string;
  conversationId: string;
  metadata?: Prisma.InputJsonValue;
  role: AiMessageRole;
}

export interface RepositoryContextSearchInput {
  endpointPath?: string;
  httpMethod?: ApiHttpMethod;
  terms: string[];
}

const CONTEXT_API_LIMIT = 80;
const CONTEXT_CHANGE_LIMIT = 40;
const CONTEXT_DEPENDENCY_LIMIT = 120;
const CONTEXT_FILE_LIMIT = 120;
const CONTEXT_SYMBOL_LIMIT = 160;
const HISTORY_MESSAGE_LIMIT = 12;

@Injectable()
export class AiConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRepositoryContext(
    repositoryId: string,
    userId: string,
    search: RepositoryContextSearchInput = { terms: [] },
  ): Promise<AiRepositoryIntelligenceContext | null> {
    const repository = await this.prisma.repository.findFirst({
      where: {
        id: repositoryId,
        ownerId: userId,
      },
    });

    if (!repository) {
      return null;
    }

    const latestScan =
      (await this.prisma.scanJob.findFirst({
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          repositoryId,
          status: ScanStatus.COMPLETED,
        },
      })) ??
      (await this.prisma.scanJob.findFirst({
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          repositoryId,
        },
      }));

    const scanFilter = latestScan ? { scanId: latestScan.id } : {};
    const [apis, apiChanges, codeFiles, codeSymbols, codeDependencies] = await Promise.all([
      this.listRelevantApis(repositoryId, scanFilter, search),
      this.prisma.apiChange.findMany({
        include: {
          newSnapshot: true,
          oldSnapshot: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: CONTEXT_CHANGE_LIMIT,
        where: {
          repositoryId,
        },
      }),
      this.listRelevantCodeFiles(repositoryId, scanFilter, search),
      this.listRelevantCodeSymbols(repositoryId, scanFilter, search),
      this.listRelevantCodeDependencies(repositoryId, scanFilter, search),
    ]);

    return {
      apiChanges,
      apis,
      codeDependencies,
      codeFiles,
      codeSymbols,
      latestScan,
      repository,
    };
  }

  private async listRelevantApis(
    repositoryId: string,
    scanFilter: Prisma.DetectedApiWhereInput,
    search: RepositoryContextSearchInput,
  ): Promise<AiRepositoryIntelligenceContext['apis']> {
    const baseWhere: Prisma.DetectedApiWhereInput = {
      repositoryId,
      ...scanFilter,
    };
    const relevanceWhere = this.buildDetectedApiRelevanceWhere(baseWhere, search);
    const orderBy: Prisma.DetectedApiOrderByWithRelationInput[] = [
      {
        path: 'asc',
      },
      {
        method: 'asc',
      },
    ];

    if (!relevanceWhere) {
      return this.prisma.detectedApi.findMany({
        include: this.detectedApiContextInclude(),
        orderBy,
        take: CONTEXT_API_LIMIT,
        where: baseWhere,
      });
    }

    const relevantApis = await this.prisma.detectedApi.findMany({
      include: this.detectedApiContextInclude(),
      orderBy,
      take: CONTEXT_API_LIMIT,
      where: relevanceWhere,
    });

    if (relevantApis.length >= CONTEXT_API_LIMIT) {
      return relevantApis;
    }

    const fallbackApis = await this.prisma.detectedApi.findMany({
      include: this.detectedApiContextInclude(),
      orderBy,
      take: CONTEXT_API_LIMIT - relevantApis.length,
      where: {
        ...baseWhere,
        id: {
          notIn: relevantApis.map((api) => api.id),
        },
      },
    });

    return [...relevantApis, ...fallbackApis];
  }

  private async listRelevantCodeFiles(
    repositoryId: string,
    scanFilter: Prisma.CodeFileWhereInput,
    search: RepositoryContextSearchInput,
  ): Promise<AiRepositoryIntelligenceContext['codeFiles']> {
    const baseWhere: Prisma.CodeFileWhereInput = {
      repositoryId,
      ...scanFilter,
    };
    const relevanceWhere = this.buildPathRelevanceWhere(baseWhere, search);

    return this.listRelevantWithFallback(
      (limit) =>
        this.prisma.codeFile.findMany({
          orderBy: {
            path: 'asc',
          },
          take: limit,
          where: baseWhere,
        }),
      relevanceWhere
        ? (limit) =>
            this.prisma.codeFile.findMany({
              orderBy: {
                path: 'asc',
              },
              take: limit,
              where: relevanceWhere,
            })
        : null,
      (limit, ids) =>
        this.prisma.codeFile.findMany({
          orderBy: {
            path: 'asc',
          },
          take: limit,
          where: {
            ...baseWhere,
            id: {
              notIn: ids,
            },
          },
        }),
      CONTEXT_FILE_LIMIT,
    );
  }

  private async listRelevantCodeSymbols(
    repositoryId: string,
    scanFilter: Prisma.CodeSymbolWhereInput,
    search: RepositoryContextSearchInput,
  ): Promise<AiRepositoryIntelligenceContext['codeSymbols']> {
    const baseWhere: Prisma.CodeSymbolWhereInput = {
      repositoryId,
      ...scanFilter,
    };
    const relevanceWhere = this.buildSymbolRelevanceWhere(baseWhere, search);
    const orderBy: Prisma.CodeSymbolOrderByWithRelationInput[] = [
      {
        kind: 'asc',
      },
      {
        name: 'asc',
      },
    ];

    return this.listRelevantWithFallback(
      (limit) =>
        this.prisma.codeSymbol.findMany({
          orderBy,
          take: limit,
          where: baseWhere,
        }),
      relevanceWhere
        ? (limit) =>
            this.prisma.codeSymbol.findMany({
              orderBy,
              take: limit,
              where: relevanceWhere,
            })
        : null,
      (limit, ids) =>
        this.prisma.codeSymbol.findMany({
          orderBy,
          take: limit,
          where: {
            ...baseWhere,
            id: {
              notIn: ids,
            },
          },
        }),
      CONTEXT_SYMBOL_LIMIT,
    );
  }

  private async listRelevantCodeDependencies(
    repositoryId: string,
    scanFilter: Prisma.CodeDependencyWhereInput,
    search: RepositoryContextSearchInput,
  ): Promise<AiRepositoryIntelligenceContext['codeDependencies']> {
    const baseWhere: Prisma.CodeDependencyWhereInput = {
      repositoryId,
      ...scanFilter,
    };
    const relevanceWhere = this.buildDependencyRelevanceWhere(baseWhere, search);

    return this.listRelevantWithFallback(
      (limit) =>
        this.prisma.codeDependency.findMany({
          orderBy: {
            sourcePath: 'asc',
          },
          take: limit,
          where: baseWhere,
        }),
      relevanceWhere
        ? (limit) =>
            this.prisma.codeDependency.findMany({
              orderBy: {
                sourcePath: 'asc',
              },
              take: limit,
              where: relevanceWhere,
            })
        : null,
      (limit, ids) =>
        this.prisma.codeDependency.findMany({
          orderBy: {
            sourcePath: 'asc',
          },
          take: limit,
          where: {
            ...baseWhere,
            id: {
              notIn: ids,
            },
          },
        }),
      CONTEXT_DEPENDENCY_LIMIT,
    );
  }

  private async listRelevantWithFallback<TItem extends { id: string }>(
    listFallbackOnly: (limit: number) => Promise<TItem[]>,
    listRelevant: ((limit: number) => Promise<TItem[]>) | null,
    listFallbackExcluding: (limit: number, ids: string[]) => Promise<TItem[]>,
    limit: number,
  ): Promise<TItem[]> {
    if (!listRelevant) {
      return listFallbackOnly(limit);
    }

    const relevantItems = await listRelevant(limit);

    if (relevantItems.length >= limit) {
      return relevantItems;
    }

    const fallbackItems = await listFallbackExcluding(
      limit - relevantItems.length,
      relevantItems.map((item) => item.id),
    );

    return [...relevantItems, ...fallbackItems];
  }

  private buildDetectedApiRelevanceWhere(
    baseWhere: Prisma.DetectedApiWhereInput,
    search: RepositoryContextSearchInput,
  ): Prisma.DetectedApiWhereInput | null {
    const filters: Prisma.DetectedApiWhereInput[] = [];

    if (search.endpointPath) {
      filters.push({
        path: {
          contains: search.endpointPath,
          mode: 'insensitive',
        },
      });
    }

    for (const term of search.terms) {
      filters.push(
        {
          controllerName: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          filePath: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          handlerName: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          path: {
            contains: term,
            mode: 'insensitive',
          },
        },
      );
    }

    if (filters.length === 0 && !search.httpMethod) {
      return null;
    }

    return {
      ...baseWhere,
      method: search.httpMethod,
      OR: filters.length > 0 ? filters : undefined,
    };
  }

  private buildPathRelevanceWhere(
    baseWhere: Prisma.CodeFileWhereInput,
    search: RepositoryContextSearchInput,
  ): Prisma.CodeFileWhereInput | null {
    if (search.terms.length === 0) {
      return null;
    }

    return {
      ...baseWhere,
      OR: search.terms.map((term) => ({
        path: {
          contains: term,
          mode: 'insensitive',
        },
      })),
    };
  }

  private buildSymbolRelevanceWhere(
    baseWhere: Prisma.CodeSymbolWhereInput,
    search: RepositoryContextSearchInput,
  ): Prisma.CodeSymbolWhereInput | null {
    if (search.terms.length === 0) {
      return null;
    }

    return {
      ...baseWhere,
      OR: search.terms.flatMap((term) => [
        {
          name: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          qualifiedName: {
            contains: term,
            mode: 'insensitive',
          },
        },
      ]),
    };
  }

  private buildDependencyRelevanceWhere(
    baseWhere: Prisma.CodeDependencyWhereInput,
    search: RepositoryContextSearchInput,
  ): Prisma.CodeDependencyWhereInput | null {
    if (search.terms.length === 0) {
      return null;
    }

    return {
      ...baseWhere,
      OR: search.terms.flatMap((term) => [
        {
          sourcePath: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          specifier: {
            contains: term,
            mode: 'insensitive',
          },
        },
        {
          targetPath: {
            contains: term,
            mode: 'insensitive',
          },
        },
      ]),
    };
  }

  async createConversation(input: CreateConversationInput): Promise<AiConversationWithMessages> {
    return this.prisma.aiConversation.create({
      data: {
        model: input.model,
        repositoryId: input.repositoryId,
        title: input.title,
        userId: input.userId,
      },
      include: this.conversationInclude(),
    });
  }

  async createMessage(input: CreateMessageInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({
        data: {
          content: input.content,
          conversationId: input.conversationId,
          metadata: input.metadata,
          role: input.role,
        },
      }),
      this.prisma.aiConversation.update({
        data: {
          updatedAt: new Date(),
        },
        where: {
          id: input.conversationId,
        },
      }),
    ]);
  }

  async findConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<AiConversationWithMessages | null> {
    return this.prisma.aiConversation.findFirst({
      include: this.conversationInclude(),
      where: {
        id: conversationId,
        userId,
      },
    });
  }

  async listConversationsForUser(userId: string): Promise<AiConversationWithMessages[]> {
    return this.prisma.aiConversation.findMany({
      include: this.conversationInclude(),
      orderBy: {
        updatedAt: 'desc',
      },
      take: 50,
      where: {
        userId,
      },
    });
  }

  async deleteConversationForUser(conversationId: string, userId: string): Promise<number> {
    const result = await this.prisma.aiConversation.deleteMany({
      where: {
        id: conversationId,
        userId,
      },
    });

    return result.count;
  }

  async listRecentMessages(
    conversationId: string,
    userId: string,
  ): Promise<AiConversationWithMessages | null> {
    return this.prisma.aiConversation.findFirst({
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: HISTORY_MESSAGE_LIMIT,
        },
        repository: true,
      },
      where: {
        id: conversationId,
        userId,
      },
    });
  }

  private conversationInclude(): {
    messages: {
      orderBy: {
        createdAt: 'asc';
      };
    };
    repository: true;
  } {
    return {
      messages: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      repository: true,
    };
  }

  private detectedApiContextInclude(): {
    apiDocumentation: {
      select: {
        markdown: true;
        openApiJson: true;
      };
    };
  } {
    return {
      apiDocumentation: {
        select: {
          markdown: true,
          openApiJson: true,
        },
      },
    };
  }
}
