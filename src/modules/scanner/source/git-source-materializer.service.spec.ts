import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  RepositoryConnectionStatus,
  RepositoryProvider,
  type Repository,
  type RepositoryConnection,
} from '@prisma/client';

import { GitSourceMaterializer } from './git-source-materializer.service';

import type { GitCommandRunnerService } from './git-command-runner.service';
import type { RepositoryConnectionsRepository } from '../../integrations/repositories/repository-connections.repository';
import type { IntegrationsService } from '../../integrations/services/integrations.service';
import type { ConfigService } from '@nestjs/config';

const timestamp = new Date('2026-06-08T00:00:00.000Z');
const commitSha = 'abc123abc123abc123abc123abc123abc123abcd';

function createRepository(provider: RepositoryProvider): Repository {
  const host = provider === RepositoryProvider.GITHUB ? 'github.com' : 'bitbucket.org';

  return {
    archivePath: null,
    connectionId: 'connection-id',
    createdAt: timestamp,
    defaultBranch: 'main',
    externalId: 'external-id',
    fullName: 'owner/api',
    id: 'repository-id',
    language: 'TypeScript',
    name: 'api',
    ownerId: 'user-id',
    provider,
    sourcePath: null,
    updatedAt: timestamp,
    uploadSizeBytes: null,
    url: `https://${host}/owner/api`,
    visibility: 'private',
  };
}

function createConnection(provider: RepositoryProvider): RepositoryConnection {
  return {
    createdAt: timestamp,
    displayName: 'Engineer',
    encryptedAccessToken: 'encrypted-token',
    encryptedRefreshToken: null,
    expiresAt: null,
    id: 'connection-id',
    lastValidatedAt: timestamp,
    organizationId: null,
    provider,
    providerUserId: 'provider-user-id',
    scopes: ['repo'],
    status: RepositoryConnectionStatus.ACTIVE,
    updatedAt: timestamp,
    userId: 'user-id',
    username: 'engineer',
  };
}

function createConfigService(materializationRoot: string): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): number | string => {
      const values: Record<string, number | string> = {
        'scanner.gitCloneTimeoutMs': 1000,
        'scanner.materializationPath': materializationRoot,
        'scanner.maxFileBytes': 1048576,
      };

      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
}

interface GitSourceMaterializerTestContext {
  gitCommandRunner: jest.Mocked<Pick<GitCommandRunnerService, 'run'>>;
  integrationsService: jest.Mocked<Pick<IntegrationsService, 'getCredentialsForConnection'>>;
  repositoryConnectionsRepository: jest.Mocked<
    Pick<RepositoryConnectionsRepository, 'findActiveByIdForUser'>
  >;
  service: GitSourceMaterializer;
}

function createContext(materializationRoot: string): GitSourceMaterializerTestContext {
  const gitCommandRunner: GitSourceMaterializerTestContext['gitCommandRunner'] = {
    run: jest.fn(),
  };
  const integrationsService: GitSourceMaterializerTestContext['integrationsService'] = {
    getCredentialsForConnection: jest.fn(),
  };
  const repositoryConnectionsRepository: GitSourceMaterializerTestContext['repositoryConnectionsRepository'] =
    {
      findActiveByIdForUser: jest.fn(),
    };

  return {
    gitCommandRunner,
    integrationsService,
    repositoryConnectionsRepository,
    service: new GitSourceMaterializer(
      createConfigService(materializationRoot),
      gitCommandRunner as unknown as GitCommandRunnerService,
      integrationsService as unknown as IntegrationsService,
      repositoryConnectionsRepository as unknown as RepositoryConnectionsRepository,
    ),
  };
}

describe(GitSourceMaterializer.name, () => {
  it('materializes GitHub repositories without putting tokens in git arguments', async () => {
    const materializationRoot = await mkdtemp(
      path.join(os.tmpdir(), 'codeatlas-git-materializer-'),
    );
    const context = createContext(materializationRoot);
    const token = 'github-secret-token';

    jest
      .mocked(context.repositoryConnectionsRepository.findActiveByIdForUser)
      .mockResolvedValue(createConnection(RepositoryProvider.GITHUB));
    jest.mocked(context.integrationsService.getCredentialsForConnection).mockResolvedValue({
      accessToken: token,
      expiresAt: null,
      refreshToken: null,
    });
    jest
      .mocked(context.gitCommandRunner.run)
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: `${commitSha}\n` });

    try {
      const source = await context.service.materialize({
        repository: createRepository(RepositoryProvider.GITHUB),
        scanId: 'scan-id',
        selectedBranch: 'main',
      });
      const cloneCall = context.gitCommandRunner.run.mock.calls[0]?.[0];

      expect(source.commitSha).toBe(commitSha);
      expect(source.branch).toBe('main');
      expect(source.sourcePath).toContain(path.join('scan-id', 'source'));
      expect(cloneCall).toBeDefined();

      if (!cloneCall) {
        throw new Error('Clone command was not invoked.');
      }

      expect(cloneCall.args).toEqual(
        expect.arrayContaining([
          'clone',
          '--depth',
          '1',
          '--single-branch',
          '--no-tags',
          '--filter=blob:limit=1048576',
          '--branch',
          'main',
          'https://github.com/owner/api.git',
        ]),
      );
      expect(JSON.stringify(cloneCall.args)).not.toContain(token);
      expect(cloneCall.env?.['CODEATLAS_GIT_TOKEN']).toBe(token);

      const askPassPath = cloneCall.env?.['GIT_ASKPASS'];
      expect(typeof askPassPath).toBe('string');

      if (typeof askPassPath !== 'string') {
        throw new Error('GIT_ASKPASS was not configured.');
      }

      await expect(readFile(askPassPath, 'utf8')).resolves.not.toContain(token);
      await source.cleanup();
    } finally {
      await rm(materializationRoot, { force: true, recursive: true });
    }
  });

  it('materializes Bitbucket repositories with provider-specific credentials', async () => {
    const materializationRoot = await mkdtemp(
      path.join(os.tmpdir(), 'codeatlas-bitbucket-materializer-'),
    );
    const context = createContext(materializationRoot);

    jest
      .mocked(context.repositoryConnectionsRepository.findActiveByIdForUser)
      .mockResolvedValue(createConnection(RepositoryProvider.BITBUCKET));
    jest.mocked(context.integrationsService.getCredentialsForConnection).mockResolvedValue({
      accessToken: 'bitbucket-secret-token',
      expiresAt: null,
      refreshToken: null,
    });
    jest
      .mocked(context.gitCommandRunner.run)
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: `${commitSha}\n` });

    try {
      const source = await context.service.materialize({
        repository: createRepository(RepositoryProvider.BITBUCKET),
        scanId: 'scan-id',
        selectedBranch: 'main',
      });
      const cloneCall = context.gitCommandRunner.run.mock.calls[0]?.[0];

      expect(cloneCall?.args).toEqual(
        expect.arrayContaining(['https://bitbucket.org/owner/api.git']),
      );
      expect(cloneCall?.env?.['CODEATLAS_GIT_USERNAME']).toBe('x-token-auth');
      expect(source.provider).toBe(RepositoryProvider.BITBUCKET);
      await source.cleanup();
    } finally {
      await rm(materializationRoot, { force: true, recursive: true });
    }
  });

  it('rejects unsafe repository URLs before invoking git', async () => {
    const materializationRoot = await mkdtemp(
      path.join(os.tmpdir(), 'codeatlas-invalid-materializer-'),
    );
    const context = createContext(materializationRoot);
    const repository = {
      ...createRepository(RepositoryProvider.GITHUB),
      url: 'https://example.com/owner/api',
    };

    await expect(
      context.service.materialize({
        repository,
        scanId: 'scan-id',
        selectedBranch: 'main',
      }),
    ).rejects.toThrow('Repository URL is invalid for the provider.');
    expect(context.gitCommandRunner.run).not.toHaveBeenCalled();

    await rm(materializationRoot, { force: true, recursive: true });
  });
});
