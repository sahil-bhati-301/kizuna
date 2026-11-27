# platform: spec digest
Source: docs/architecture-design.md. The architecture doc wins any conflict.
Covers: §2.1, §2.2 (kernel row, graph, packaging, cycles), §2.3, §7.5 (shared conventions, kernel schema, reporting), §7.6, §8.1, §8.2, §8.3, §8.4, §8.5, §8.6, §13, §14, Appendix A

## §2.1 Architecture diagram

Components: Browser / PWA (Next.js web app, IndexedDB content cache and answer buffer); CDN + object storage; modular monolith (API process: HTTP `/v1`, auth routes, webhooks; worker process: jobs, schedules, outbox relay; modules in-process); PostgreSQL (schema per module, event log, job queue); content pipeline CLI; billing provider (signed webhooks); email / Web Push; Sentry, OpenTelemetry, PostHog. Web reaches the API through the `/api` same-origin proxy. → arch §2.1

## §2.2 Modules

| Module | Owns (Postgres schema) | Responsibilities | May depend on |
|---|---|---|---|
| `kernel` (shared) | `kernel` (outbox, audit) | IDs, injected clock, seeded RNG, event bus, transaction/outbox helpers, logging, config | — |

→ arch §2.2

Dependency graph (arrows are "depends on"):

- drills → insights → memory → content → kernel
- drills → memory; drills → content; insights → content
- drills → billing → identity → kernel
- engagement subscribes to events from memory, drills and insights (dashed); engagement → identity

→ arch §2.2

**Packaging in v1.** `identity`, `billing` and `engagement` ship as **one package, `packages/account`**, with a sub-folder per area. Calls between those three areas may be direct, without going through a public interface. Each keeps its own Postgres schema. The boundary rules in §2.3 apply in full between `account` and the core modules (`content`, `memory`, `insights`, `drills`). → arch §2.2

## §2.3 Module rules and communication

- A module's only import path is its public `index.ts`, which exposes queries and commands. CI enforces this with dependency-cruiser (or eslint-plugin-boundaries). → arch §2.3
- **Domain event definitions live in `packages/contracts`**, not in the producing module. A consumer imports the event type from `contracts`, never from the producer. `contracts` itself imports no domain module (only `kernel` types and Zod), so the browser bundle stays clean. CI also checks that the package graph has no cycles. → arch §2.3
- Application code never joins across schemas. A module that needs another module's data calls its query API (in-process) or keeps a local read model fed by events. → arch §2.3
- **Exception, for reporting only:** a `reporting` schema holds read-only views that may join across schemas. Only the internal dashboards (Metabase, on the read replica) and offline analysis use it. Application code and the worker never read from it, which CI enforces. → arch §2.3
- The `domain/` layer of every module is pure: no I/O, no `Date.now()`, no `Math.random()`. Clock and RNG are injected. → arch §2.3
- A command that changes state runs in one transaction and writes its domain events to the **outbox** in that same transaction. The worker relays outbox rows to `pg-boss` queues. Handlers are idempotent and deduplicate by event ID. When feedback must be immediate, the composition root (`apps/server`) also dispatches in-process after commit, and the outbox remains the durability guarantee. **Both paths deliver the same event with the same event ID.** Every handler records the event IDs it has processed, so the second delivery is a no-op. There is no separate direct call that bypasses the event. → arch §2.3

| Event | Producer | Consumers |
|---|---|---|
| `ReviewRecorded` | memory | engagement (XP, daily activity), insights (incremental aggregates) |
| `TraceStageChanged` | memory | engagement (ranks, family completion) |
| `SessionCompleted` | drills | engagement (goal, streak, achievements), insights (detection job) |
| `HypothesisActivated` / `HypothesisResolved` | insights | engagement ("Knot untied"), notifications |
| `ExperimentConcluded` | insights | population statistics |
| `EntitlementsChanged` | billing | drills (limits cache), web client (refresh) |
| `UserDeleted` | identity | every module (cascade delete) |

→ arch §2.3

## §7.5 Persistence: shared conventions

- One PostgreSQL database with **one schema per module**. Each module owns its migrations (Drizzle). → arch §7.5
- Timestamps are `timestamptz` in UTC; IDs are UUIDv7 or ULIDs (time-sortable). → arch §7.5
- `MEMORY_TRACE` references content polymorphically through `(item_type, item_id)`; no foreign key across schemas; release validation checks that every reference resolves. → arch §7.5

Kernel schema:

```
kernel.outbox               id · topic · payload jsonb · created_at · published_at
kernel.audit_log            id · actor · action · target · at · meta jsonb
kernel.engine_version_set   id PK · versions jsonb UNIQUE                 (scheduler, planner, grader, classifier, …)
kernel.processed_event      consumer · event_id · PK(consumer, event_id) · processed_at   (handler idempotency)
pgboss.*                    job queue tables (managed by pg-boss)
```

→ arch §7.5

## §7.6 Background jobs (worker)

| Job | Trigger | Purpose |
|---|---|---|
| `outbox.relay` | continuous | Publish outbox events to queues |
| `insights.detect` | `SessionCompleted`, debounced 5 minutes | Incremental detection for one user; advances the lifecycle |
| `insights.nightly` | nightly, for users active in the last 30 days | Full recompute, evidence decay, lifecycle transitions |
| `experiments.evaluate` | daily | Schedule day 13–15 retention checks (capacity-capped, balanced across arms), record missed check days, evaluate complete windows, close experiments, release waitlists after the window closes |
| `memory.fitParams` | weekly, eligible users and facet families | FSRS optimisation per facet family, accepted only if held-out log-loss improves |
| `population.stats` | nightly | Calibration offsets `c` and group offsets `μ_g` (§5.3), population FSRS parameters per facet family, item difficulty, `σ_type` priors, confusion mining (k-anonymous), detector precision |
| `engagement.closeDay` | hourly, per timezone bucket | Finalise days 6 hours after they end (offline-sync grace period), streaks and freezes |
| `notify.reminders` | hourly, per timezone bucket | Opt-in reminders with frequency caps |
| `billing.reconcile` | daily | Re-sync subscriptions with the provider |
| `privacy.export` / `privacy.delete` | on request | Build an export bundle; cascade-delete across every schema and remove the user's rows from Parquet archives (§7.8) |
| `db.maintenance` | monthly | Create partitions; write trace checkpoints at the archive boundary (§7.5), then archive events older than 90 days to Parquet, one file per (month, user-hash bucket) so a deletion rewrites only small files |

→ arch §7.6

Content release job: content digest → arch §7.6

## §8.1 Technology stack

Use the current stable or LTS release of each tool. → arch §8.1

| Concern | Choice |
|---|---|
| Language | TypeScript (strict), end to end |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router), React |
| UI | Tailwind CSS, shadcn/ui (Radix), Motion; design tokens in `packages/ui` |
| Client state | TanStack Query; XState or a typed reducer for sessions |
| Charts and graphs | visx or Recharts; d3-force for the threads graph |
| Japanese input | WanaKana (MIT) |
| API server | Fastify + Zod type provider + OpenAPI generation |
| Database | PostgreSQL 16+ (managed); needs point-in-time recovery |
| ORM and migrations | Drizzle ORM + drizzle-kit |
| Jobs and queue | pg-boss (Postgres-backed) |
| Scheduling algorithm | ts-fsrs; FSRS optimiser run in the worker |
| Auth | Better Auth (self-hosted) |
| Billing | Stripe Billing, or Paddle as merchant of record, behind the adapter |
| Email | Resend or Postmark |
| Storage and CDN | Cloudflare R2 (or S3) + CDN |
| Observability | Sentry, OpenTelemetry, pino logs |
| Product analytics and flags | PostHog; learning experiments live in the domain, not in PostHog |
| Internal dashboards | Metabase on a read replica |
| Testing | Vitest, fast-check, Playwright, Testcontainers (Postgres) |
| CI/CD | GitHub Actions: lint, typecheck, test, boundaries, simulation gate, migrations |
| Offline analysis | DuckDB over Parquet exports; Python (pandas, scipy); never in the request path |
| Japanese NLP (future) | Sudachi or kuromoji.js |

→ arch §8.1

## §8.2 Repository layout and module internals

Layout (pipeline and content packages: see pipeline and content digests): `apps/web/` (Next.js), `apps/server/` (composition root), `packages/kernel/` (ids, clock, seeded RNG, events, transaction and outbox helpers), `packages/contracts/` (Zod API schemas → OpenAPI + typed client; domain event definitions, §2.3), `packages/memory/`, `packages/insights/`, `packages/drills/` (with `grading/`: pure normalisation and grading, also used by web), `packages/account/` (one package in v1, three schemas: `identity/`, `billing/`, `engagement/`; §2.2), `packages/ui/` (design system, web only), `packages/sim/` (synthetic learners, dev and CI only), `content/sources.lock.yaml`, `content/overrides/`. → arch §8.2

):

- `apps/web/`: Next.js: marketing, public kanji pages, learner app
- `apps/server/`: composition root: Fastify adapters, auth, webhooks, worker entrypoint
- `packages/kernel/`: ids, clock, seeded RNG, events, transaction and outbox helpers
- `packages/contracts/`: Zod API schemas → OpenAPI + typed client; domain event definitions (§2.3)
- `packages/memory/`: traces, FSRS adapter, uncertainty, mastery, stats
- `packages/insights/`: error classifier, detectors, statistics, hypotheses, experiments
- `packages/drills/`: planner, curriculum, placement, exercise generators, distractors; `grading/`: pure normalisation and grading (also used by web)
- `packages/account/`: one package in v1, three schemas (see §2.2): `identity/` (users, settings, auth integration), `billing/` (entitlements, provider adapters), `engagement/` (XP, goals, streaks, ranks, achievements)
- `packages/ui/`: design system (web only)
- `packages/sim/`: synthetic learners and benchmarks (dev and CI only)
- `content/sources.lock.yaml`: pinned source versions and checksums; `content/overrides/`: reviewed human corrections (YAML)
- `docs/architecture-design.md`

→ arch §8.2

Every backend module follows the same internal shape:

```
packages/<module>/src/
  domain/   pure logic: types, rules, statistics (no I/O, injected clock and RNG)
  app/      use cases: orchestrate domain + repositories inside transactions
  infra/    Postgres repositories, job handlers, provider adapters
  index.ts  public API: the only import path for other modules
```

→ arch §8.2

**Enforced rules:**

- `domain/` imports nothing from `infra/`.
- Modules import each other only through `index.ts`.
- `apps/web` may import only `contracts`, `drills/grading`, `content` types and `ui`.
- Migrations live with the module that owns the schema.

→ arch §8.2

## §8.3 Deployment topology

- **web:** Vercel, or a container beside the API.
- **api:** 1–2 small containers (Fly.io, Render or Railway), stateless and horizontally scalable.
- **worker:** one container, same image, different entrypoint.
- **Postgres:** managed, with point-in-time recovery. Add a read replica once dashboards or analytics start to load production.
- **Environments:** local (docker-compose Postgres seeded with a content release), staging, production.
- **Migrations** run in CI before deploy and follow expand-then-contract, so a deploy never needs downtime.

Object storage and CDN: pipeline digest. → arch §8.3

## §8.4 Scalability and performance

| | 1k DAU | 10k DAU | 100k DAU |
|---|---|---|---|
| Reviews per day (planning assumption: ≈ 100 per active user with the v1 facet set; between 10 and 17 minutes at 6–10 s per answer. The real figure and time come from the workload gate and beta data, and the new-item rate adapts to keep learners within their goal, §6.2) | 100k | 1M | 10M |
| Peak answer-batch requests/s (5 answers per batch, 10× peak) | ≈ 2.5 | ≈ 25 | ≈ 250 |
| `review_event` growth per year | ≈ 37M rows | ≈ 365M rows | ≈ 3.7B rows |
| `review_event` storage per year (≈ 200 bytes per row plus indexes) | ≈ 10 GB | ≈ 100 GB | ≈ 1 TB (archived to Parquet after 90 days) |
| `memory_trace` rows (registered users ≈ 5× DAU, ≈ 1.5k traces each) | ≈ 7.5M | ≈ 75M | ≈ 750M |
| Architecture response | 1 API instance, small Postgres | 2–3 API instances, larger Postgres, read replica | Hash-partition traces by user; archive events older than 90 days to Parquet and columnar storage; a dedicated worker pool for insights |

→ arch §8.4

- **Hot path cost.** Planning a session loads one user's traces through `(user_id, …)` indexes: a few thousand rows, under 50 ms of CPU. → arch §8.4
- **Batch cost.** Nightly insights ≈ 100 ms per active user, ≈ 17 CPU-minutes at 10k DAU. → arch §8.4
- **Performance budgets (p95):** session plan < 300 ms, answer batch < 150 ms, home < 200 ms, LCP < 2.5 s on a mid-range phone. → arch §8.4
- **Extraction seams, in order:** (1) insights batch to its own worker pool; (2) analytics to columnar storage; (3) content serving fully static. No microservice before 100k DAU. → arch §8.4

## §8.5 Observability and operations

- **Signals:** structured JSON logs (pino) with a request ID and a hashed user ID; OpenTelemetry traces, and Sentry for frontend and backend errors; PostHog for funnels and retention. → arch §8.5
- **Learning-health dashboards** (Metabase): calibration, mature retention vs. target, detector precision, hypothesis resolution rates, intervention effects with confidence intervals, backlog distribution. → arch §8.5
- **Alerts:** API 5xx rate, p95 latency, job failures and queue depth, webhook failures, calibration drift, content-report spikes. → arch §8.5
- **Short runbooks** for webhook replay, user data export and deletion, and restore from point-in-time recovery (release rollback: pipeline digest). → arch §8.5

## §8.6 Testing and explainability

- **Unit tests** cover pure domain logic: FSRS adapter, grading, classifier, detectors, planner, streak and achievement rules. → arch §8.6
- **Property-based tests** (fast-check) check invariants, e.g. stability never goes negative; intervals are monotonic in grade; the planner never exceeds its budget or quotas; siblings are always spaced. → arch §8.6
- **Simulation harness (`packages/sim`).** Synthetic learners have a ground-truth forgetting model, deliberately *different from FSRS*. They also have injected weaknesses (a radical-family penalty, confusion pairs, an on/kun penalty, kana-detail error rates, a context gap), latency and adherence models, and population-wide difficulty that FSRS defaults don't know about. → arch §8.6
- **CI gates (initial targets):** → arch §8.6
  - recall of injected weaknesses ≥ 0.8 within 300 reviews;
  - ≤ 5% of *clean* learners receive any confirmed false knot over 90 simulated days, *including* when population-wide difficulty is injected;
  - the experiment estimator recovers an injected effect within its CI ≥ 90% of the time, using the day 13–15 check design, capacity-capped evaluated items, missed check days, and realistic per-user item counts;
  - **workload gate:** a simulated learner on the default track and default new-item rate needs no more daily review time than their goal (10 minutes) on at least 90% of days over 180 simulated days, without entering catch-up mode. A flagged facet (§4.1) may be enabled only if this gate still passes with it switched on.
- **Replay and golden tests.** Recorded (anonymised) event logs are replayed through engine versions, and the outputs (states, hypotheses, plans) are diffed. Any behaviour change must be intentional. → arch §8.6
- **Isolation tests** run on every repository and endpoint (§7.4). **API contract tests** come from the Zod/OpenAPI schemas. **End-to-end tests** (Playwright) cover sign-up → placement → session → streak → checkout (in the provider's test mode). → arch §8.6
- **Explainability surfaces:** reason codes on every session item, evidence on every knot, an audited admin "learner inspector". → arch §8.6
- Content validation and engine versioning / shadow mode: see pipeline digest. → arch §8.6

## §13 Success metrics

| Category | Metric |
|---|---|
| **North star** | Kanji reaching *Mastered* per weekly active learner (combines learning and retention) |
| Learning quality | Mature retention vs. target r; calibration (ECE, log-loss); knot resolution rate within 30 days; intervention effect size (platform, delayed); days to mastery per kanji |
| Engagement | D1, D7 and D30 retention; sessions per week; goal hit rate; session completion rate; streak distribution |
| Business | Activation (3 sessions in the first week); free → paid conversion; monthly churn |
| Guardrails | Backlog size per user; in-session success rate kept within 75–90%; "not right" feedback rate; content-error reports per 10k reviews |

→ arch §13

## §14 Open decisions

1. **Auth:** Better Auth (ownership) vs. Clerk (speed). Recommended: Better Auth.
2. **Billing:** Stripe Billing with Stripe Tax vs. a merchant of record (Paddle).
3. **Free-tier boundaries:** kanji scope, daily new limit, knot limits (starting proposal in §7.7).
4. **Default desired retention** for beginners: 0.90 vs. 0.85, to reduce early workload.
5. **Mnemonics at launch:** author our own for all 2,136 kanji (LLM-drafted, human-reviewed), or start with user-written mnemonics plus component explanations.
6. **Audio at launch:** TTS vendor and licence terms, or defer audio to Phase 3.
7. **Licensing of original content** (keywords, mnemonics, tags) after legal review.
8. **Brand vocabulary:** "knots" for weaknesses and the 糸 → 絆 ranks need validating with beta users.
9. **Flagged facets:** whether isolated `reading_on` / `reading_kun` and `recognition` traces are switched on after launch. Decided in Phase 3 by the workload gate and beta data (§4.1).
10. **Detection threshold τ:** keep 0.5 logits (≈ 5–6 points at 90% accuracy), or loosen it, after simulation (§5.3).

→ arch §14

## Appendix A: Glossary

| Term | Meaning |
|---|---|
| On'yomi / Kun'yomi | Sino-Japanese reading / native Japanese reading of a kanji |
| Okurigana | Kana that follow a kanji stem (食**べる**) |
| Rendaku | Sequential voicing in compounds (人 + 人 → ひと**び**と) |
| Sokuon | Gemination with small っ (学校 がっこう) |
| Jukujikun | A reading that belongs to the whole word, not to its individual kanji (今日 きょう) |
| Jōyō kanji | The official list of 2,136 kanji for general use (2010) |
| Radical / component | The dictionary classification element (one per kanji) / any visual building block (many per kanji) |
| Trace / facet | One independently forgettable memory: (user, item, facet) / the dimension being tested (meaning, on, kun, …) |
| D / S / R | FSRS Difficulty / Stability (days to reach 90% recall) / Retrievability (current recall probability) |
| R30 | Predicted recall 30 days from now with no review |
| Residual | Observed outcome minus the memory model's predicted probability |
| `δ_g` | A group's shrunken logit offset: how much worse (or better) than predicted the learner is on that group |
| Knot | The user-facing name for a confirmed weakness hypothesis |
| Focus drill | A short intervention block targeting one knot |
| Waitlist control | In-scope items that get standard SRS first and the intervention after the evaluation window |

→ arch §A
