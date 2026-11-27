# kernel: rules for Claude

The small, pure foundation every module depends on (arch §2.2, §2.3). It depends on nothing.

## Public API (import from `@kizuna/kernel` only; `src/index.ts` is the single entry)
- Clock: `Clock`, `FakeClock`, `systemClock`, `createFixedClock(at)`, `createFakeClock(start)`.
- RNG: `Rng` (`nextUint32()`, `next()`), `createSeededRng(seed)`: sfc32 seeded via splitmix32. Deterministic, not cryptographically secure.
- IDs: `createIdGenerator({ clock, rng })` returns `() => string` making UUIDv7 (RFC 9562): 48-bit ms timestamp, version 7, variant 0b10, 42-bit monotonic counter (method 1), 32 random bits. Strictly increasing per generator. `isUuidV7(value)`.
- Errors: abstract `AppError` (`code`, `details?`, `cause`), `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, `isAppError(e)`.
- Logger: `Logger`, `LogLevel`, `LogFields`, `LogEntry`, `noopLogger`, `createMemoryLogger()` (test double).
- Events: `DomainEvent<TType, TPayload>`, `createEvent({ newId, clock }, type, payload)`. Base types only; concrete events live in `packages/contracts`.

## Rules
- `clock.ts` (`systemClock`) is the only file in the repo that may read `Date.now()` or call `new Date()` without arguments. Do not mention `Date.now` in other kernel files, even in comments: a test greps for it.
- No `Math.random` anywhere. Randomness comes from an injected `Rng`.
- No I/O, no Node built-ins, no runtime dependencies.
- Everything new must be re-exported from `src/index.ts`; `package.json` exports only `"."`.
- Out of scope here: persistence, the outbox, concrete events, config loading.

## How to test
- `pnpm verify:affected` from the repo root. Tests are `src/*.test.ts` (Vitest, fast-check for properties).
- `src/boundaries.test.ts` checks the public surface, the purity rules and the ESLint and dependency-cruiser rules for `domain/`.
