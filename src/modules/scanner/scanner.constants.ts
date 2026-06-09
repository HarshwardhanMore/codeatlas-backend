import { ScanStatus } from '@prisma/client';

export const SCAN_PROGRESS_STAGES = {
  analyzingAst: 'Analyzing source code AST',
  completed: 'Completed',
  discoveringFiles: 'Discovering source files',
  discoveringApis: 'Discovering API routes',
  generatingApiChangeReport: 'Generating API change report',
  generatingDocumentation: 'Generating API documentation',
  materializingSource: 'Materializing repository source',
  preparingWorkspace: 'Preparing repository workspace',
  queued: 'Queued',
  running: 'Running repository scanner lifecycle',
  validatingRepository: 'Validating repository',
} as const;

export const SCANNER_LIFECYCLE_DELAY_MS = 150;
export const SCAN_PROGRESS_MIN = 0;
export const SCAN_PROGRESS_MAX = 100;
export const SCANNER_WORKSPACE_DIRECTORY_MODE = 0o700;

export const SCANNER_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

export const SUPPORTED_CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

export const TERMINAL_SCAN_STATUSES: readonly ScanStatus[] = [
  ScanStatus.COMPLETED,
  ScanStatus.FAILED,
  ScanStatus.CANCELLED,
];

export const ACTIVE_SCAN_STATUSES: readonly ScanStatus[] = [ScanStatus.QUEUED, ScanStatus.RUNNING];
