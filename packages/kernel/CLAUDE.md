# kernel: rules for Claude

The small, pure foundation every module depends on (arch §2.2, §2.3). It depends on nothing.

## Public API (import from `@kizuna/kernel` only; `src/index.ts` is the single entry)
- Clock: `Clock`, `FakeClock`, `systemClock`, `createFixedClock(at)`, `createFakeClock(start)`.
- RNG: `Rng` (`nextUint32()`, `next()`), `createSeededRng(seed)`: sfc32 seeded via splitmix32. Deterministic, not cryptographically secure.
- IDs: `createIdGenerator({ clock, rng })` returns `() => string` making UUIDv7 (RFC 9562): 48-bit ms timestamp, version 7, variant 0b10, 42-bit monotonic counter (method 1), 32 random bits. Strictly increasing per generator. `isUuidV7(value)`.
- Errors: abstract `AppError` (`code`, `details?`, `cause`), `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, `isAppError(e)`.
- Logger: `Logger`, `LogLevel`, `LogFields`, `LogEntry`, `noopLogger`, `createMemoryLogger()` (test double).
- Events: `DomainEvent<TType, TPayload>`, `createEvent({ newId, clock }, type, payload)`. Base types only; concrete events live in `packages/contracts`.

## Layout
- `src/domain/`: pure code (`clock.ts` types and fixed/fake clocks, `rng.ts`, `ids.ts`, `errors.ts`, `events.ts`). The repo ESLint and dependency-cruiser `domain/` rules apply here.
- `src/clock.ts` (`systemClock`) and `src/logger.ts` stay outside `domain/` because they touch the wall clock or emit output.
- `src/index.ts` is the only entry; `src/exports.test.ts` pins its runtime export list.

## Rules
- `src/clock.ts` (`systemClock`) is the only kernel file that may read `Date.now()`. Inside `domain/` the repo ESLint rule forbids `Date.now`, `Math.random` and `new Date()`.
- No `Math.random` anywhere. Randomness comes from an injected `Rng`.
- No I/O, no Node built-ins, no runtime dependencies.
- Everything new must be re-exported from `src/index.ts`; `package.json` exports only `"."`.
- Out of scope here: persistence, the outbox, concrete events, config loading.

## How to test
- `pnpm verify:affected` from the repo root. Tests are `src/**/*.test.ts` (Vitest, fast-check for properties).
- `src/boundaries.test.ts` checks the public surface and that the ESLint and dependency-cruiser rules cover `domain/`.
