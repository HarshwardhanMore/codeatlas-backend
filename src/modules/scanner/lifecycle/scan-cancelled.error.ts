export class ScanCancelledError extends Error {
  constructor(scanId: string) {
    super(`Repository scan ${scanId} was cancelled.`);
    this.name = 'ScanCancelledError';
  }
}
