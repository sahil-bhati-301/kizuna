# Kizuna: rules for Claude

Adaptive kanji-learning SaaS. TypeScript modular monolith: pnpm + Turborepo, Fastify API + worker, Next.js web, PostgreSQL (schema per module), pg-boss.

## Read this, not everything
- Start every session with docs/plan/STATUS.md and the WP file you were given.
- Specs: docs/specs/<module>.md, only the anchors your WP cites. Never load docs/architecture-design.md whole; open a section only when a digest links to it and is unclear.
- Each package has its own CLAUDE.md. Read it before editing that package.

## Commands (always use these)
- pnpm verify:affected: lint + typecheck + tests + boundaries for changed packages (terse output)
- pnpm verify: everything, once before a PR
- pnpm db:up / pnpm db:migrate: local Postgres
- Never run raw test commands with full output.
- Until W00-1 lands, the verify scripts and pnpm commands above do not exist. The only test command is `node --test "scripts/claude/*.test.mjs"`.

## Architecture rules (CI enforces them)
- Modules import each other only through src/index.ts. Domain events live in packages/contracts.
- domain/ is pure: no I/O, no Date.now(), no Math.random(); clock and RNG are injected.
- No cross-schema joins in application code. Every user-scoped query takes ctx and runs under RLS.
- State-changing commands: one transaction, events written to the outbox in it; handlers are idempotent by event ID.
- apps/web may import only contracts, drills/grading, content types and ui.

## Working rules
- One WP per session. Stay inside the WP's declared packages; anything else is a listed deviation.
- Out-of-scope ideas go to docs/plan/backlog.md, not into code.
- Tier A ambiguity: write an OPEN-Q in the WP file and never guess.
- 3-strike rule: after the same failure survives 3 attempts, stop and write a stuck note.
- Subagent results: at most 150 words plus files changed. No raw logs.
- Budget notices come from the guard hook. On WRAP-UP, finish the current step, then /checkpoint. On CHECKPOINT-NOW, /checkpoint immediately. Never ignore one.
- If the session-start card shows a paused WP, resume it with /wp <id>. Never start it over.
- Commit at every green point. Never end a session with uncommitted work.
- Commit messages: imperative, scoped (e.g. "memory: replay out-of-order answers").
- Write British spelling and plain, concise language.
