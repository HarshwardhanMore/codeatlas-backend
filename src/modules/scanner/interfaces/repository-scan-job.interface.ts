import type { ScanStatus } from '@prisma/client';

export interface RepositoryScanJobPayload {
  repositoryId: string;
  scanId: string;
  userId: string;
}

export interface RepositoryScanJobResult {
  scanId: string;
  status: ScanStatus;
}

export interface ScanProgressSnapshot {
  progress: number;
  stage: string;
  message: string;
  updatedAt: string;
}

export type RepositoryScanJobName = 'repository.scan.lifecycle';

export type ScanProgressReporter = (progress: ScanProgressSnapshot) => Promise<void>;
