import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import { GitCommandRunnerService } from './git-command-runner.service';
import { SourceMaterializationError } from './source-materialization.error';
import { RepositoryConnectionsRepository } from '../../integrations/repositories/repository-connections.repository';
import { IntegrationsService } from '../../integrations/services/integrations.service';
import { assertScannerNotAborted } from '../scanner-abort.util';
import { SCANNER_WORKSPACE_DIRECTORY_MODE } from '../scanner.constants';

import type {
  MaterializedRepositorySource,
  MaterializeRepositorySourceInput,
  SourceMaterializer,
} from './source-materializer.interface';
import type { Repository } from '@prisma/client';

interface ProviderCloneConfig {
  host: string;
  username: string;
}

type GitRepositoryProvider = typeof RepositoryProvider.BITBUCKET | typeof RepositoryProvider.GITHUB;

const ASKPASS_SCRIPT = `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "$CODEATLAS_GIT_USERNAME" ;;
  *) printf '%s\\n' "$CODEATLAS_GIT_TOKEN" ;;
esac
`;
const ASKPASS_SCRIPT_MODE = 0o700;
const GIT_SUPPORTED_PROVIDERS = new Set<RepositoryProvider>([
  RepositoryProvider.BITBUCKET,
  RepositoryProvider.GITHUB,
]);
const PROVIDER_CLONE_CONFIGS: Record<GitRepositoryProvider, ProviderCloneConfig> = {
  [RepositoryProvider.BITBUCKET]: {
    host: 'bitbucket.org',
    username: 'x-token-auth',
  },
  [RepositoryProvider.GITHUB]: {
    host: 'github.com',
    username: 'x-access-token',
  },
};
const SAFE_REPOSITORY_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

@Injectable()
export class GitSourceMaterializer implements SourceMaterializer {
  private readonly cloneTimeoutMs: number;
  private readonly materializationRoot: string;
  private readonly maxFileBytes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitCommandRunner: GitCommandRunnerService,
    private readonly integrationsService: IntegrationsService,
    private readonly repositoryConnectionsRepository: RepositoryConnectionsRepository,
  ) {
    this.cloneTimeoutMs = this.configService.getOrThrow<number>('scanner.gitCloneTimeoutMs');
    this.materializationRoot = path.resolve(
      this.configService.getOrThrow<string>('scanner.materializationPath'),
    );
    this.maxFileBytes = this.configService.getOrThrow<number>('scanner.maxFileBytes');
  }

  supports(provider: RepositoryProvider): boolean {
    return GIT_SUPPORTED_PROVIDERS.has(provider);
  }

  async materialize(
    input: MaterializeRepositorySourceInput,
  ): Promise<MaterializedRepositorySource> {
    if (!this.supports(input.repository.provider)) {
      throw new SourceMaterializationError('Repository provider is not supported for Git cloning.');
    }

    assertScannerNotAborted(input.abortSignal);

    const provider = input.repository.provider as GitRepositoryProvider;
    const cloneUrl = this.buildCloneUrl(input.repository);
    const selectedBranch = this.normalizeBranch(input.selectedBranch);
    const materializationRoot = this.resolveMaterializationPath(input.scanId);
    const sourcePath = path.join(materializationRoot, 'source');
    const askPassPath = path.join(materializationRoot, 'git-askpass.sh');

    await rm(materializationRoot, { force: true, recursive: true });
    await mkdir(materializationRoot, {
      mode: SCANNER_WORKSPACE_DIRECTORY_MODE,
      recursive: true,
    });
    await writeFile(askPassPath, ASKPASS_SCRIPT, { mode: ASKPASS_SCRIPT_MODE });

    try {
      const credentials = await this.getCredentials(input.repository);
      const providerConfig = PROVIDER_CLONE_CONFIGS[provider];
      const args = this.createCloneArgs(cloneUrl, sourcePath, selectedBranch);

      await this.gitCommandRunner.run({
        abortSignal: input.abortSignal,
        args,
        env: {
          CODEATLAS_GIT_TOKEN: credentials.accessToken,
          CODEATLAS_GIT_USERNAME: providerConfig.username,
          GIT_ASKPASS: askPassPath,
          GIT_TERMINAL_PROMPT: '0',
        },
        timeoutMs: this.cloneTimeoutMs,
      });

      const commitSha = await this.resolveCommitSha(sourcePath, input.abortSignal);

      return {
        branch: selectedBranch,
        cleanup: async (): Promise<void> => {
          await rm(materializationRoot, { force: true, recursive: true });
        },
        commitSha,
        provider: input.repository.provider,
        sourcePath,
      };
    } catch (error) {
      await rm(materializationRoot, { force: true, recursive: true });

      if (error instanceof SourceMaterializationError) {
        throw error;
      }

      throw new SourceMaterializationError('Repository source could not be downloaded.');
    }
  }

  private async getCredentials(repository: Repository): Promise<{ accessToken: string }> {
    const connection = await this.repositoryConnectionsRepository.findActiveByIdForUser(
      repository.connectionId,
      repository.ownerId,
    );

    if (connection?.provider !== repository.provider) {
      throw new SourceMaterializationError(
        'Repository credentials are invalid or expired. Reconnect the repository provider.',
      );
    }

    try {
      const credentials = await this.integrationsService.getCredentialsForConnection(connection);

      return {
        accessToken: credentials.accessToken,
      };
    } catch {
      throw new SourceMaterializationError(
        'Repository credentials are invalid or expired. Reconnect the repository provider.',
      );
    }
  }

  private buildCloneUrl(repository: Repository): string {
    const provider = repository.provider as GitRepositoryProvider;
    const providerConfig = PROVIDER_CLONE_CONFIGS[provider];
    const segments = repository.fullName.split('/');
    const owner = segments[0] ?? '';
    const repositoryName = segments[1] ?? '';

    if (
      segments.length !== 2 ||
      !SAFE_REPOSITORY_SEGMENT_PATTERN.test(owner) ||
      !SAFE_REPOSITORY_SEGMENT_PATTERN.test(repositoryName)
    ) {
      throw new SourceMaterializationError('Repository identity is invalid for cloning.');
    }

    this.assertRepositoryUrl(repository, providerConfig.host);

    return `https://${providerConfig.host}/${owner}/${repositoryName}.git`;
  }

  private assertRepositoryUrl(repository: Repository, expectedHost: string): void {
    let url: URL;

    try {
      url = new URL(repository.url);
    } catch {
      throw new SourceMaterializationError('Repository URL is invalid.');
    }

    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== expectedHost) {
      throw new SourceMaterializationError('Repository URL is invalid for the provider.');
    }
  }

  private createCloneArgs(
    cloneUrl: string,
    sourcePath: string,
    selectedBranch: string | null,
  ): string[] {
    const args = [
      '-c',
      'credential.helper=',
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--no-tags',
      `--filter=blob:limit=${this.maxFileBytes.toString()}`,
    ];

    if (selectedBranch) {
      args.push('--branch', selectedBranch);
    }

    args.push(cloneUrl, sourcePath);

    return args;
  }

  private normalizeBranch(branch: string | null): string | null {
    if (!branch) {
      return null;
    }

    const normalizedBranch = branch.trim();

    if (
      normalizedBranch.length === 0 ||
      normalizedBranch.startsWith('-') ||
      normalizedBranch.endsWith('/') ||
      normalizedBranch.endsWith('.lock') ||
      normalizedBranch.includes('..') ||
      normalizedBranch.includes('@{') ||
      this.hasUnsafeBranchCharacter(normalizedBranch)
    ) {
      throw new SourceMaterializationError('Repository branch is invalid for cloning.');
    }

    return normalizedBranch;
  }

  private hasUnsafeBranchCharacter(branch: string): boolean {
    for (const character of branch) {
      if (character.charCodeAt(0) <= 31 || ' ~^:?*[\\'.includes(character)) {
        return true;
      }
    }

    return false;
  }

  private resolveMaterializationPath(scanId: string): string {
    const resolvedPath = path.resolve(this.materializationRoot, scanId);
    const allowedPrefix = `${this.materializationRoot}${path.sep}`;

    if (!resolvedPath.startsWith(allowedPrefix)) {
      throw new SourceMaterializationError('Scan materialization path is invalid.');
    }

    return resolvedPath;
  }

  private async resolveCommitSha(
    sourcePath: string,
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const result = await this.gitCommandRunner.run({
        abortSignal,
        args: ['rev-parse', 'HEAD'],
        cwd: sourcePath,
        timeoutMs: this.cloneTimeoutMs,
      });
      const commitSha = result.stdout.trim();

      return /^[a-f0-9]{40}$/i.test(commitSha) ? commitSha : null;
    } catch {
      return null;
    }
  }
}
