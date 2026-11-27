import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isAppError,
} from './index.js';

// Public API (AC4):
//   abstract class AppError extends Error { readonly code: string; readonly details?: Record<string, unknown> }
//     constructor(message: string, options?: { details?: Record<string, unknown>; cause?: unknown })
//   NotFoundError ('NOT_FOUND'), ValidationError ('VALIDATION'), ConflictError ('CONFLICT'),
//   ForbiddenError ('FORBIDDEN') extend AppError; name equals the class name.
//   isAppError(e: unknown): e is AppError

const cases = [
  [NotFoundError, 'NOT_FOUND', 'NotFoundError'],
  [ValidationError, 'VALIDATION', 'ValidationError'],
  [ConflictError, 'CONFLICT', 'ConflictError'],
  [ForbiddenError, 'FORBIDDEN', 'ForbiddenError'],
] as const;

describe('typed errors', () => {
  for (const [Ctor, code, name] of cases) {
    it(`${name} has code ${code} and is an AppError and an Error`, () => {
      const err = new Ctor('boom', { details: { id: 'x' } });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Ctor);
      expect(err.code).toBe(code);
      expect(err.name).toBe(name);
      expect(err.message).toBe('boom');
      expect(err.details).toEqual({ id: 'x' });
      expect(isAppError(err)).toBe(true);
    });
  }

  it('keeps the cause', () => {
    const cause = new Error('root');
    expect(new ConflictError('dup', { cause }).cause).toBe(cause);
  });

  it('isAppError rejects plain errors and non-errors', () => {
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError({ code: 'NOT_FOUND', message: 'x' })).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
