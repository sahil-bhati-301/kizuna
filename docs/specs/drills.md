# drills: spec digest
Source: docs/architecture-design.md. The architecture doc wins any conflict.
Covers: §2.2 (drills row), §2.4, §6.1, §6.2, §6.3, §6.4, §6.5, §6.6, §7.5 (drills schema, acceptance window, session expiry, timestamp clamping)

## §2.2 Module row

| Module | Owns (Postgres schema) | Responsibilities | May depend on |
|---|---|---|---|
| `drills` | `drills` | Session planning, curriculum, placement, exercise generation, distractors, grading | insights, memory, content, billing (entitlements), kernel |

→ arch §2.2

- `insights` never calls `drills`. It emits *intervention requests* (`{template, traceIds, dose}`) and *arm assignments* as data. `drills` reads those and turns them into exercises. → arch §2.2
- The `drills` schema is owned by `drills`; no cross-schema joins in application code. → arch §2.2

## §2.4 Core flow: one study session

Sequence, in order (participants: Web client C, API composition root A, drills D, insights I, memory M, engagement E, worker W):

1. C → A: `POST /v1/sessions {mode, budgetMinutes}`. → arch §2.4
2. A → D: `planSession(ctx)`. → arch §2.4
3. D → M: `snapshot(user)`: traces, R, uncertainty, stats. → arch §2.4
4. D → I: active hypotheses, arm assignments, probe requests. → arch §2.4
5. D → A: `SessionPlan` (items, exercise specs, reason codes, seed). A → C: plan; content is loaded from CDN / IndexedDB by ID. → arch §2.4
6. Loop, each answer: C grades locally with the shared grader, instant feedback. → arch §2.4
7. C → A: `POST /v1/sessions/{id}/answers` (batch, idempotency keys). → arch §2.4
8. A → D: re-grade authoritatively. → arch §2.4
9. D → I: `classifyErrors(answers, content)`. → arch §2.4
10. D → M: `recordReviews` (one txn: review_event + trace update + outbox). A → C: confirmations, XP deltas. → arch §2.4
11. C → A: `POST /v1/sessions/{id}/complete`. → arch §2.4
12. A → E: `SessionCompleted`, in-process after commit (same event ID as outbox; idempotent). A → C: summary. → arch §2.4
13. W → I: `insights.detect(user)`, debounced; W → I: `experiments.evaluate` (daily). → arch §2.4

## §6.1 Session planning pipeline

Inputs: memory snapshot · active hypotheses + arms · settings · entitlements · content index · now · seed. → arch §6.1

Stages:

1. Candidate generation: due · relearn · focus · probes · retention checks · new
2. Eligibility filters: suspended · sibling spacing · entitlement scope · seen today
3. Quota allocation: time budget → items per source · backlog guard
4. Rank within source: urgency · expected benefit · information value
5. Exercise realisation: type by facet × stage · distractors · hints
6. Sequencing: warm-up · interleave · spacing · end on success

Output: SessionPlan + reason codes, persisted with seed and engine versions. → arch §6.1

The planner is a pure function, `plan(snapshot, content, config, now, seed)`. The seed is stored with the session, so any session can be reproduced exactly. → arch §6.1

## §6.2 Candidate sources and quotas

| Source | What it contains | Share of time budget | Ordering within source |
|---|---|---|---|
| Due reviews | Graduated traces with R ≤ r, plus **Learning traces whose rule-based `due_at` has passed** (§4.3) | Claims first, up to 100% | Learning traces always first, oldest `due_at` first (they are the most fragile and have no R), including in catch-up mode. Then graduated traces, lowest R first; in catch-up mode, still-salvageable graduated traces (R ≥ 0.5) go before the rest. |
| Relearn steps | Items failed earlier today | As needed | Sequenced in the session |
| Focus drills | Intervention blocks for active hypotheses (treatment arm) | ≤ 25%, one block per session | Expected benefit |
| Diagnostic probes | In-scope traces of candidate hypotheses; high-uncertainty traces | ≤ 10% | Widest interval and R closest to 0.5 (most informative) |
| Retention checks | Day 13–15 outcome checks for the evaluated items of experiments, balanced across treatment and control on each day (§6.7) | ≤ 5% (new experiments wait instead; the only overrun is the floor of 1 check a day) | Check date. An evaluated item whose natural review falls in its window uses that review. |
| New items | Next lesson items from the curriculum | Whatever budget remains, capped by the daily new limit and entitlement | Curriculum order |

→ arch §6.2

- **Budget.** The user's time goal (say 10 minutes) is converted to item counts using their median latency per exercise type, with defaults until there is data. → arch §6.2
- **Backlog guard.** If items due exceed 2× daily capacity, new items drop to 0. The UI shows "catch-up mode" and the backlog is spread over several days. → arch §6.2
- **Adaptive new rate.** New items shrink when the FSRS 7-day workload forecast exceeds capacity, and grow when the learner is consistently under it. → arch §6.2
- **Reason codes:** `DUE`, `OVERDUE`, `RELEARN`, `NEW`, `FOCUS(h)`, `PROBE(h)`, `RETENTION_CHECK(e)`, `CONTEXT_UNLOCK`. The UI turns these into "Why this?". → arch §6.2

## §6.3 Exercise catalog and realisation

| ID | Exercise | Prompt → response | Facet | Input |
|---|---|---|---|---|
| E1 | Meaning recall | 海 → "sea" | meaning | MC, then typed to graduate (§4.3); typed after |
| E2 | Reading recall | 海 (on) → かい | reading_on / reading_kun (flag, off in v1) | typed kana (romaji auto-converts) |
| E3 | Recognition | "sea" → pick 海 among lookalikes | recognition (flag, off in v1) | MC, k = 5–6 |
| E4 | Word reading | 海外 → かいがい | context | typed |
| E5 | Word meaning | 海外 → "overseas" | word_meaning | MC, then typed to graduate (§4.3); typed after |
| E6 | Sentence reading | highlighted word in a sentence → reading | context | typed |
| E7 | Cloze choice | ＿い日 → 暑 or 熱 | focus (H3, H7) | MC |
| E8 | Minimal-pair discrimination | 未 or 末? as a rapid series | focus (H2) | 2-choice, timed |
| E9 | Component assembly | build 晴 from its parts | lesson / focus (H1, H8) | drag or tap |
| E10 | Family sort / odd-one-out | which one lacks 氵? | focus (H1, H5) | tap |
| E11 | Reading-type sort | 生 in 生活 / 生きる / 生ビール → on or kun | focus (H4) | tap |
| E12 | Kana minimal pair | しょう vs しょ (audio or typing) | focus (H6) | tap or typed |
| E13 | Writing (later) | stroke input checked against KanjiVG | writing | canvas |

→ arch §6.3

**Exercise type by stage** → arch §6.3

- **New:** a lesson card (components animate together, stroke-order animation, keyword, mnemonic, 2–3 example words with audio), followed by an immediate easy check (MC).
- **Learning:** E1 and E5 as MC first, mostly with dissimilar distractors so the learner does not practise errors, then as a typed prompt to graduate. A trace leaves Learning only through a correct typed answer (§4.3).
- **Context traces (E4)** are typed from the start, so their first answer is already an FSRS rating.
- **Young:** E1 typed, then E4 and E5 as words unlock (plus E2 and E3 when those facets are enabled).
- **Mature and above:** typed only, plus E4–E6. **Font variation** (sans, serif, handwritten-style) builds recognition that does not depend on one typeface.

**Plug-in contract.** An exercise type is four pieces: an `ExerciseSpec` Zod schema in `contracts`, a pure generator in `drills`, a renderer in `web`, and a pure grader in `drills/grading`. → arch §6.3

## §6.4 Distractors

- **Pools** come from the content graph: `visual_similar`, `semantic_related`, phonetic and homophone, same radical, and random same-level kanji. → arch §6.4
- **Difficulty** follows stage. Early stages get mostly dissimilar options. Later stages include one confusable. Focus drills use targeted confusables. → arch §6.4
- Distractors the learner has **already been introduced to** are preferred. → arch §6.4
- Each option records its relation type, so classifying a wrong pick (`REC_DISTRACTOR:*`) costs nothing. → arch §6.4

## §6.5 Curriculum and new-item ordering

- **Default track.** Frequency-weighted and component-first, in topological order: 木 before 林 and 森, and a component's keyword before the first kanji that uses it. Lessons hold 5–8 items with a coherent theme or shared component. → arch §6.5
- **Stagger, then contrast.** Two highly confusable kanji are never introduced in the same lesson. The second arrives once the first is Young or better, along with a contrast card. → arch §6.5
- **Alternative tracks:** JLPT (approximate) and school grade (Kyōiku). A track is ordering configuration, not code. → arch §6.5
- **Vocabulary.** Once a kanji's meaning reaches S ≥ 3 days, the learner gets 1–3 common words per core reading (frequency-ranked), which creates context traces. A word unlocks only when all of its kanji qualify (§4.1). → arch §6.5

## §6.6 Sequencing and in-session adaptivity

- **Warm-up:** the first 2–3 items have high R, to build momentum. → arch §6.6
- **Interleaving.** Facets and exercise types are mixed. *Siblings* (same kanji, different facets) stay at least 5 items apart. Confusables also stay at least 5 apart, except inside a contrast block. → arch §6.6
- **Difficulty pacing.** The target success band is 80–90%. If live success drops below 70% over 8 items, the client pulls easier items forward using a deterministic rule shared with the server. → arch §6.6
- **Relearn.** A failed item is re-queued after about 5 items. → arch §6.6
- **End on success.** The last items come from high-R traces (the peak-end effect). → arch §6.6

## §7.5 Persistence: drills parts

Common rules: one PostgreSQL database with **one schema per module**. Each module owns its migrations (Drizzle). Timestamps are `timestamptz` in UTC, and IDs are UUIDv7 or ULIDs, which are time-sortable. → arch §7.5

The table definitions are **pseudo-schema**, meant as design guidance rather than DDL. → arch §7.5

```
drills.session              id PK · user_id · mode · status · budget_s · plan jsonb (items, specs, reason codes)
                            · seed · planner_version · started_at · completed_at · summary jsonb
drills.exercise_spec        hash PK · exercise_type · spec jsonb (prompt, options with relation tags) · created_at
drills.learner_curriculum   user_id PK · track · cursor · introduced_count · paused_until
drills.placement_run        id · user_id · state jsonb · result jsonb · completed_at
```

→ arch §7.5

Related ER links: `USER ||--o{ SESSION : "studies in"`; `SESSION ||--o{ REVIEW_EVENT : "contains"`. → arch §7.5

`memory.review_event` carries `session_id`, `exercise_spec_hash bytea` (pointing at `drills.exercise_spec.hash`) and `engine_version_set_id int`; there is no foreign key across schemas. → arch §7.5

**Answer-batch acceptance window** (the idempotency table is owned by `memory`; drills enforces the window) → arch §7.5

- The answer-batch transaction inserts the key in `review_idempotency` first; on conflict, the answer is a duplicate and its earlier confirmation is returned. → arch §7.5
- Keys are kept for **35 days after first receipt** and then deleted daily. → arch §7.5
- **Server-side acceptance window.** The server rejects any answer whose session (`drills.session.started_at`, a server timestamp) began more than **28 days** before the answer's `received_at`. Every answer belongs to a session, so a retry is always received within 28 days of its session start. Its first receipt can't have been before that start, so its key is at most 28 days old when the retry arrives, safely inside the 35-day retention. → arch §7.5
- The client discards buffered answers older than 21 days, which avoids sending answers the server will reject. This is only a courtesy; correctness doesn't depend on it. → arch §7.5
- A rejected late answer is returned as `410 Gone` with `problem+json`, and the client drops it. → arch §7.5
- **Sessions expire before the window.** An unfinished session can be resumed (`GET /v1/sessions/{id}`) for at most **7 days** after `started_at`. After that the server closes it, and the client plans a new one. A resumed session therefore never runs close to the 28-day limit, and normal study never meets a `410`. → arch §7.5

**Client timestamps are clamped** → arch §7.5

- They cannot be later than `received_at`.
- They cannot fall more than 24 hours before the session started.
- Consequence used by memory: an answer's `occurred_at` is at least its session start − 24 h, and the session started at most 28 days before receipt, so `occurred_at ≥ received_at − 29 days`.
