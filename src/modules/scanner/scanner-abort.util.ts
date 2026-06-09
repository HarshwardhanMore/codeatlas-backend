export class ScannerAbortError extends Error {
  constructor(message = 'Repository scan was stopped.') {
    super(message);
    this.name = ScannerAbortError.name;
  }
}

export function assertScannerNotAborted(abortSignal?: AbortSignal): void {
  if (!abortSignal?.aborted) {
    return;
  }

  if (abortSignal.reason instanceof Error) {
    throw abortSignal.reason;
  }

  throw new ScannerAbortError();
}

export function isScannerAbortError(error: unknown): error is Error {
  return error instanceof ScannerAbortError || error instanceof DOMException;
}
