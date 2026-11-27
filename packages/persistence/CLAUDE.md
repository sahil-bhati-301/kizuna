# persistence: rules for Claude

Local database set-up and the test harness (arch §3, §8). Real module schemas are out of scope until W01-2 and W05-3.

## Commands (from the repo root)
- `pnpm db:up`: `docker compose up -d --wait`; returns once Postgres is healthy, with a 60 s limit. Credentials: kizuna/kizuna, database kizuna, port 5432.
- `pnpm db:migrate`: `drizzle-kit migrate` against `DATABASE_URL` (defaults to the compose database). Migrations live in `packages/persistence/drizzle/`. `pnpm db:down` stops the database.
- Config: `drizzle.config.ts` at the root. Add module schema files to `schema` when they exist.

## Public API (`src/index.ts` only)
- `runMigrations(pool)`, `migrationsFolder`.

## Test harness (`test/harness.ts`)
- `startTestDatabase()` starts a fresh Postgres 16 container per test file, migrates it and returns `{ pool, begin, stop }`. `begin()` opens a transaction; roll it back in `afterEach` for isolation. Call `stop()` in `afterAll`.
- Needs Docker. Locally, with no Docker daemon, the suite skips with a printed reason. With `CI=true` it never skips: a missing Docker fails.
- Ryuk and image pulls need network; first run is slow (hence the 120 s hook timeout).
