/** Base error for all semantic-loop failures. */
export class SemanticLoopError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SemanticLoopError";
  }
}

/** Thrown when a requested item or candidate does not exist. */
export class NotFoundError extends SemanticLoopError {
  public constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown when input fails validation (missing fields, out-of-range scores). */
export class ValidationError extends SemanticLoopError {
  public constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
