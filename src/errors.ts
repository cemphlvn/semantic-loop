export class SemanticLoopError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SemanticLoopError";
  }
}

export class NotFoundError extends SemanticLoopError {
  public constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends SemanticLoopError {
  public constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
