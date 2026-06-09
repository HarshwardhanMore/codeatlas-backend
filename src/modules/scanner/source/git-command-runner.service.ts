import { spawn } from 'node:child_process';

import { Injectable } from '@nestjs/common';

export interface GitCommandInput {
  abortSignal?: AbortSignal;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface GitCommandResult {
  stdout: string;
}

const MAX_CAPTURED_OUTPUT_BYTES = 8192;

@Injectable()
export class GitCommandRunnerService {
  run(input: GitCommandInput): Promise<GitCommandResult> {
    return new Promise<GitCommandResult>((resolve, reject) => {
      const child = spawn('git', input.args, {
        cwd: input.cwd,
        env: {
          ...process.env,
          ...input.env,
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let killTimeout: NodeJS.Timeout | null = null;
      const fail = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        if (killTimeout) {
          clearTimeout(killTimeout);
        }

        input.abortSignal?.removeEventListener('abort', handleAbort);
        reject(error);
      };
      const handleAbort = (): void => {
        child.kill('SIGTERM');
        killTimeout = setTimeout(() => {
          child.kill('SIGKILL');
        }, 1000);
        fail(
          input.abortSignal?.reason instanceof Error
            ? input.abortSignal.reason
            : new Error('Git operation was aborted.'),
        );
      };
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        fail(new Error('Git operation timed out.'));
      }, input.timeoutMs);

      if (input.abortSignal?.aborted) {
        handleAbort();
        return;
      }

      input.abortSignal?.addEventListener('abort', handleAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendBoundedOutput(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendBoundedOutput(stderr, chunk);
      });
      child.on('error', (error) => {
        fail(error);
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        input.abortSignal?.removeEventListener('abort', handleAbort);

        if (killTimeout) {
          clearTimeout(killTimeout);
        }

        if (code === 0) {
          resolve({ stdout });
          return;
        }

        reject(new Error(stderr.trim() || 'Git operation failed.'));
      });
    });
  }

  private appendBoundedOutput(current: string, chunk: Buffer): string {
    const next = `${current}${chunk.toString('utf8')}`;

    return next.length > MAX_CAPTURED_OUTPUT_BYTES
      ? next.slice(next.length - MAX_CAPTURED_OUTPUT_BYTES)
      : next;
  }
}
