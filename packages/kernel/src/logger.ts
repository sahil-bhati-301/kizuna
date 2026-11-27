export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

/** Structured logger. Concrete adapters (e.g. pino) live in apps; kernel defines the shape. */
export interface Logger {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  /** A logger that adds `bindings` to every entry; call fields win on a clash. */
  child: (bindings: LogFields) => Logger;
}

export interface LogEntry {
  level: LogLevel;
  msg: string;
  fields: LogFields;
}

const noop = () => {};

export const noopLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => noopLogger,
};

/** Test double: records every entry in `entries`, in order. */
export function createMemoryLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const make = (bindings: LogFields): Logger => {
    const at =
      (level: LogLevel) =>
      (msg: string, fields?: LogFields): void => {
        entries.push({ level, msg, fields: { ...bindings, ...fields } });
      };
    return {
      debug: at('debug'),
      info: at('info'),
      warn: at('warn'),
      error: at('error'),
      child: (more) => make({ ...bindings, ...more }),
    };
  };
  return { logger: make({}), entries };
}
