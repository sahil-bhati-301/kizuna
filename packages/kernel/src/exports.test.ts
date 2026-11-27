import { describe, expect, it } from 'vitest';
import * as kernel from './index.js';

// Runtime export list captured from index.ts before the W01-6 move (types are erased).
const EXPECTED = [
  'AppError',
  'ConflictError',
  'ForbiddenError',
  'NotFoundError',
  'ValidationError',
  'createEvent',
  'createFakeClock',
  'createFixedClock',
  'createIdGenerator',
  'createMemoryLogger',
  'createSeededRng',
  'isAppError',
  'isUuidV7',
  'noopLogger',
  'systemClock',
];

describe('public surface is unchanged (W01-6 AC2)', () => {
  it('exports exactly the same runtime names', () => {
    expect(Object.keys(kernel).sort()).toEqual(EXPECTED);
  });
});
