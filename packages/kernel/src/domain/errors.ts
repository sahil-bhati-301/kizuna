export interface AppErrorOptions {
  details?: Record<string, unknown>;
  cause?: unknown;
}

/** Base class for expected, typed failures. `code` is stable and safe to map to HTTP. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    if (options.details !== undefined) this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  override readonly name = 'NotFoundError';
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION';
  override readonly name = 'ValidationError';
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT';
  override readonly name = 'ConflictError';
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN';
  override readonly name = 'ForbiddenError';
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
