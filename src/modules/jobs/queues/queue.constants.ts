export const QUEUE_NAMES = {
  apiAnalysis: 'api.analysis',
  documentationGenerate: 'documentation.generate',
  repositoryScan: 'repository.scan',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const REPOSITORY_SCAN_JOB_NAME = 'repository.scan.lifecycle';

export const DEFAULT_REMOVE_ON_COMPLETE = {
  age: 24 * 60 * 60,
  count: 1000,
} as const;

export const DEFAULT_REMOVE_ON_FAIL = {
  age: 7 * 24 * 60 * 60,
  count: 5000,
} as const;

export const DEFAULT_BACKOFF_DELAY_MS = 5000;
