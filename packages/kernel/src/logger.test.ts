import { describe, expect, expectTypeOf, it } from 'vitest';
import { createMemoryLogger, noopLogger, type LogEntry, type Logger } from './index.js';

// Public API (AC4):
//   type LogLevel = 'debug' | 'info' | 'warn' | 'error'
//   type LogFields = Record<string, unknown>
//   interface Logger { debug|info|warn|error(msg: string, fields?: LogFields): void; child(bindings: LogFields): Logger }
//   interface LogEntry { level: LogLevel; msg: string; fields: LogFields }
//   noopLogger: Logger
//   createMemoryLogger(): { logger: Logger; entries: LogEntry[] }   — test double

describe('logger', () => {
  it('Logger has the agreed shape', () => {
    expectTypeOf<Logger['info']>().toEqualTypeOf<
      (msg: string, fields?: Record<string, unknown>) => void
    >();
    expectTypeOf<Logger['child']>().returns.toEqualTypeOf<Logger>();
  });

  it('noopLogger accepts every level and child without throwing', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      expect(() => noopLogger[level]('m', { a: 1 })).not.toThrow();
    }
    expect(() => noopLogger.child({ a: 1 }).info('m')).not.toThrow();
  });

  it('memory logger records level, message and fields', () => {
    const { logger, entries } = createMemoryLogger();
    logger.info('hello', { userId: 'u1' });
    logger.error('bad');
    expect(entries).toEqual<LogEntry[]>([
      { level: 'info', msg: 'hello', fields: { userId: 'u1' } },
      { level: 'error', msg: 'bad', fields: {} },
    ]);
  });

  it('child merges bindings, call fields win, parent is unchanged', () => {
    const { logger, entries } = createMemoryLogger();
    const child = logger.child({ module: 'memory', reqId: 'r1' });
    child.warn('w', { reqId: 'r2', n: 1 });
    logger.debug('d');
    expect(entries).toEqual<LogEntry[]>([
      { level: 'warn', msg: 'w', fields: { module: 'memory', reqId: 'r2', n: 1 } },
      { level: 'debug', msg: 'd', fields: {} },
    ]);
  });
});
