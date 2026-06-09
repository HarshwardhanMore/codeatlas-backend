export class SourceMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = SourceMaterializationError.name;
  }
}

export function isSourceMaterializationError(error: unknown): error is SourceMaterializationError {
  return error instanceof SourceMaterializationError;
}
