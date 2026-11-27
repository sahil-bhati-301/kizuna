# memory: spec digest

Source: docs/architecture-design.md. The architecture doc wins any conflict.
Covers: §2.2 (memory row), §4.1, §4.2, §4.3, §4.4, §4.5, §4.6, §4.7, §4.8, §7.5 (memory schema).

## Module (§2.2)

- Owns schema `memory`. Responsibilities: traces, review and exposure logs, FSRS scheduling, uncertainty, mastery aggregation, learner statistics, parameter fitting. → arch §2.2
- May depend on: content, kernel. → arch §2.2

## 4.1 Memory traces and facets

A trace is the tuple `(user, item_type, item_id, facet)`. Traces are forgotten independently. → arch §4.1

| Facet | Prompt → answer | Applies to | v1 launch | Notes |
|---|---|---|---|---|
| `meaning` | 海 → "sea" | kanji | **on** | Introduced in the lesson |
| `context` | 海外 → かいがい | word | **on** | The kanji-in-vocabulary dimension. Each answer is attributed to the aligned readings through `word_kanji`. |
| `word_meaning` | 海外 → "overseas" | word | **on** | |
| `reading_on` | 海 → かい | kanji with a core on'yomi | flag, off | Primary on'yomi only |
| `reading_kun` | 海 → うみ; 食べる → たべる | kanji with a core kun'yomi | flag, off | Primary kun'yomi only, prompted in its okurigana word form |
| `recognition` | "sea" plus lookalikes → 海 | kanji | flag, off | Visual discrimination. Unlocks when `meaning` reaches Young. While off, lookalike distractor picks (`REC_DISTRACTOR:*`) still feed insights as evidence. |
| `writing` (later) | "sea" → strokes | kanji | — | Phase 5 |

→ arch §4.1

- Launch set is small: four isolated facets plus words gave about 150 reviews a day, 15–25 minutes against a 10-minute default goal. → arch §4.1
- Readings are learned through words. In v1 every reading is practised and measured through `context` traces of aligned words (先生, 一生, 生まれる). → arch §4.1
- Each flagged facet is enabled per release, only when the workload gate in §8.6 passes with it included (Phase 3, §12). No code change needed. → arch §4.1
- Vocabulary unlocks once all of a word's kanji have `meaning` at S ≥ 3 days. → arch §4.1
- One answer, one scheduling update: a correct 先生 answer reschedules only the 先生 `context` trace, but counts as an analytic observation for 生:on:せい. → arch §4.1

## 4.2 Forgetting model: FSRS

Each trace stores Difficulty `D` (1–10), Stability `S` (days until predicted recall falls to 90%), and the time of its last review. → arch §4.2

```
Retrievability:  R(t) = (1 + f · t / S)^(−d),   with f = 0.9^(−1/d) − 1   so that R(S) = 0.9
Next interval for desired retention r:   t = (S / f) · (r^(−1/d) − 1)
```

→ arch §4.2

- Use FSRS through `ts-fsrs` (MIT). In FSRS-6 decay `d` is a trainable per-user parameter; older versions fix it at 0.5. → arch §4.2
- Default desired retention is r = 0.90. The user can pick 0.80–0.95. → arch §4.2
- Parameters per facet family: `meaning`, `context`, `word_meaning`, and each flagged facet once enabled. → arch §4.2
 - Before population data exists: FSRS default parameters, per-family starting difficulty `D₀` set by hand. → arch §4.2
  - Population: once a family has about 20,000 scheduled reviews across users, the nightly job fits its population parameters. New users start on those. → arch §4.2
  - Personal: once a user has about 1,000 scheduled reviews in a family, a weekly worker job runs the FSRS optimiser; kept only if log-loss on a held-out tail of their reviews improves. → arch §4.2
  - Parameters are versioned in `memory.scheduler_params`, keyed by `(user_id or population, facet_family)`. → arch §4.2
- Short-term learning and relearning steps happen inside the session (a failed item returns after about 5 items). Intervals get fuzz and load balancing. → arch §4.2
- Explanations read like "you'll likely remember this for about 12 days". → arch §4.2

## 4.3 From answers to evidence

- Auto-grading. Learners never self-grade an objective exercise; self-grading only for uncheckable recall such as paper writing. → arch §4.3
- FSRS grade mapping (v1: two grades only): → arch §4.3
  - wrong, "I don't know", or any answer that needed help (a hint, or a second try after giving a valid reading of the wrong kind) → **Again**
  - correct on the first try without help → **Good**
- Events record how the answer was reached (hint, retry, latency). **Hard and Easy are not used in v1.** Richer mappings (hint → Hard, fast → Easy) run in shadow mode (§8.6), on only if they improve held-out log-loss. → arch §4.3
- Guessing. Multiple choice (MC) has guess rate `γ = 1/k`. Analytics use `p = γ + (1 − γ)·R`. → arch §4.3
- How a trace moves through Learning: → arch §4.3
  1. The lesson starts the trace in Learning: `state = learning`, no S or D yet, rule-based `due_at` of the next learning day.
  2. In-session: shown as MC first, then as a typed prompt (E1 or E5 typed) once answered correctly as MC.
  3. Graduation: the first typed answer is the first FSRS rating, which sets S and D. Correct graduates the trace (stage then comes from S). Wrong keeps it in Learning, typed step repeated later in the session or next session.
  4. Coming back: a trace still in Learning keeps the rule-based `due_at`: next learning day, then 2 days if missed again.
- MC answers never change long-term state; they drive only the in-session steps. Stored with `counts_for_scheduling = false`, and they never change S, D or the FSRS due date. → arch §4.3
- Traces without S: until the first FSRS rating, residuals (§5.3) and uncertainty (§4.4) use prior `p₀` (§4.5) in place of R. `n_eff` starts at 0, and MC answers add `w_ex = 0.5` as usual. → arch §4.3
- After graduation, a trace is scheduled from typed answers only. MC answers are never part of the FSRS parameter fit (§4.2), which uses only answers with `counts_for_scheduling = true`. → arch §4.3
- With `recognition` enabled, its MC answers are scored with the guess rate and use `k ≥ 5`. → arch §4.3
- "I don't know" is a first-class button. → arch §4.3
- Shared pure grading package (client and server re-grade) handles: → arch §4.3
  - kana normalisation and romaji-to-kana conversion (WanaKana);
  - okurigana;
  - meaning fuzzy match (Damerau–Levenshtein, tolerance scaled by length);
  - accept-lists and user synonyms.
- Alternative valid readings. A valid reading of the wrong kind (なま when the on'yomi was asked) gets "valid reading, but we want the on'yomi", a retry, and is logged as `R_ALT_VALID`. For scheduling it counts as **Again**. In v1, where readings are asked only inside words, the equivalent signal is `R_ON_KUN_SWAP_IN_WORD` (§5.2). Any core reading of the requested kind counts as correct. → arch §4.3

## 4.4 Uncertainty

A light, explainable uncertainty layer sits on top of the FSRS point estimate for each trace. → arch §4.4

```
Effective evidence (on each graded review):  n_eff ← n_eff · e^(−Δt/h) + w_ex      h = 60 days; w_ex = 1 typed, 0.5 MC
Belief about current recall:                 R_now ~ Beta(α = R·κ, β = (1 − R)·κ),  κ = κ₀ + n_eff,  κ₀ = 2
```

→ arch §4.4

- New, placed or long-unseen traces get wide intervals; frequently verified ones narrow. → arch §4.4
- Uses: (1) diagnostic probes prefer wide-interval in-scope traces; (2) UI shows unverified mastery (for example placement) as hatched; (3) insights weight evidence by `n_eff`. → arch §4.4
- Validation: within calibration bins, the 80% interval should contain the realised hit rate about 80% of the time. → arch §4.4

## 4.5 Priors, placement, and transfer

- Population item difficulty `b_j` is fitted nightly (Rasch-style, from first-review outcomes). Prior for unseen traces, with user ability `θ_u`: `p₀ = σ(θ_u − b_j + transfer_j)`. → arch §4.5
- Transfer adjustments, rule-based in v1: → arch §4.5
  - raise the prior if a phonetic-series sibling with the same reading is Mature;
  - raise it if all components are known;
  - lower it if a visually similar known kanji is fragile (interference risk).
- Uses: placement, ordering new items ("easy wins" in the first week), expected values for first reviews in residuals. → arch §4.5
- v1 start (no placement test): every learner starts at lesson 1; each lesson item has an "I already know this" button. A skipped item gets a conservative trace (S ≈ 14 days, `source=self_report`, `n_eff = 0`) and is verified on its first review. → arch §4.5
- Placement test (Phase 3), about 3 minutes: → arch §4.5
  - Adaptive over frequency bands; learner self-reports "know it?"; a sample is verified.
  - Inferred-known kanji get conservative traces (S ≈ 14–21 days, `source=placement`, `n_eff = 0`).
  - Their due dates are spread over 30 days.
- Anki import (Phase 3): → arch §4.5
  - Cards whose front is a single Jōyō kanji are matched by literal and seed its `meaning` trace.
  - Review history is replayed through FSRS to set the starting state (`source=import`).
  - Unmatched cards are listed, not imported.

## 4.6 Multidimensional mastery

- Trace stage: → arch §4.6
  - New: not yet introduced (no trace row yet, or not yet seen in a lesson).
  - Learning: introduced but not yet graduated (no S yet, §4.3), or graduated with S < 1 day.
  - From stability S: Young (1–7 d) → Mature (7–30 d) → Strong (30–90 d) → Mastered (≥ 90 d).
- Kanji mastery vector = stage of meaning plus one segment per core primary reading (on and kun, where they exist). A reading segment shows the best stage among the learner's context words using that reading. Enabled flagged facets add segments. Drawn as a mastery ring. → arch §4.6
- A kanji counts as **Mastered** when: → arch §4.6
  - meaning is Strong or better;
  - for each core primary reading that has at least one aligned curriculum word, at least one context word using it is Mature or better. A reading with no such word is not required. If none of the kanji's core readings has an aligned curriculum word, Mastered rests on meaning and any enabled isolated facets alone.;
  - any enabled isolated facets are Strong or better.
- A kanji counts as **Mature** (used by the first rank's sub-levels, §7.2) when its meaning trace is Mature or better and at least one of its context words is Young or better. A kanji with no context words yet counts on meaning alone. → arch §4.6
- Group mastery (radical family, JLPT level, semantic field) = the fraction Mastered, plus mean **R30**: predicted recall 30 days ahead if nothing is reviewed. → arch §4.6
- Skill profile: group effects `δ_g` (§5.3) shown as plain-language bars, never as a ranking against named users. → arch §4.6

## 4.7 Exposure history and event log

- `memory.review_event` is append-only and holds every graded answer: → arch §4.7
  - a hash of the exercise spec (prompt, options shown, relation type of each distractor); the spec is stored once in `drills.exercise_spec`;
  - raw and normalised response, correctness, grade, latency, hints, error classes;
  - pre- and post-review state as numeric columns (S, D, R), engine-version-set ID, experiment arm, idempotency key.
- Row is compact (about 200 bytes instead of about 1 KB). The table is partitioned by month on the server receive time (§7.5). → arch §4.7
- `memory.exposure_event` holds non-graded contact: lesson viewed, focus-drill exposure (§6.7), word seen in a sentence, dictionary lookup. → arch §4.7
- `memory_trace` is a projection, rebuildable by replaying events through a given scheduler version. → arch §4.7

## 4.8 Calibration monitoring

- Per user and globally track: log-loss, Brier score, reliability bins (predicted R against observed outcome), **mature retention** (first-try success on intervals of 7 days or more, against target r). → arch §4.8
- Poor per-user calibration triggers a parameter refit. Global drift triggers an investigation. → arch §4.8

## 7.5 Persistence: memory schema

- One PostgreSQL database, one schema per module. Each module owns its migrations (Drizzle). Timestamps are `timestamptz` in UTC; IDs are UUIDv7 or ULIDs. → arch §7.5
- `MEMORY_TRACE` references content polymorphically through `(item_type, item_id)`; no cross-schema foreign key; release validation checks every reference resolves. → arch §7.5
- Pseudo-schema, not DDL: → arch §7.5

```
memory.memory_trace         id PK · user_id · item_type · item_id · facet · state(new|learning|review|relearning|suspended)
                            · stability · difficulty · last_review_at · due_at · reps · lapses · n_eff · prior_p
                            · source(lesson|self_report|placement|import) · initial_state jsonb · scheduler_version
                            · created_at · replayed_at · updated_at
                            UNIQUE(user_id, item_type, item_id, facet) · INDEX(user_id, due_at) · INDEX(user_id, state)
memory.review_event         id · received_at (server) · PK(id, received_at) · user_id · trace_id · session_id
                            · occurred_at (client, clamped) · exercise_type · exercise_spec_hash bytea
                            · response_raw · response_norm · correct · grade · latency_ms · hints · error_classes text[]
                            · confused_with jsonb · counts_for_scheduling
                            · pre_s real · pre_d real · pre_r real · post_s real · post_d real
                            · engine_version_set_id int · experiment_arm · idempotency_key
                            PARTITION BY RANGE (received_at) monthly · INDEX(user_id, occurred_at) · INDEX(trace_id, occurred_at)
memory.review_idempotency   idempotency_key PK · user_id · review_event_id · received_at   (not partitioned)
                            INDEX(received_at) · rows older than 35 days pruned daily
memory.trace_checkpoint     trace_id · user_id · as_of (occurred_at boundary) · state jsonb (S, D, reps, lapses, state)
                            · scheduler_version · PK(trace_id, as_of)   (written only when as_of ≤ now − 29 d; see Concurrency)
memory.exposure_event       id · user_id · item_type · item_id · kind(lesson|focus|sentence|lookup) · session_id · occurred_at
memory.scheduler_params     scope(user_id | population) · facet_family · version · params real[] · n_reviews
                            · log_loss · fitted_at · active
memory.population_calibration  version · kind(facet_cell | group) · key · offset real · n_reviews · n_users · fitted_at
memory.learner_stats        user_id PK · latency_by_exercise jsonb · ability θ jsonb · traits jsonb · updated_at
memory.user_synonym         user_id · item_type · item_id · text
```

→ arch §7.5

### Partitioning and uniqueness

- Every primary key and unique constraint on a partitioned table must include the partition key. So `review_event` uses `PK(id, received_at)`, and the "save this answer only once" rule lives in the unpartitioned `review_idempotency` table. The answer-batch transaction inserts the key there first; on conflict the answer is a duplicate and its earlier confirmation is returned. Partitioning uses server `received_at`. → arch §7.5
- Pruning. Keys are kept for **35 days after first receipt** and then deleted daily. No retry may outlive its key; enforced on the server: → arch §7.5
  - Server-side acceptance window. The server rejects any answer whose session (`drills.session.started_at`, a server timestamp) began more than **28 days** before the answer's `received_at`.
  - The client discards buffered answers older than 21 days (courtesy only).
  - A rejected late answer returns `410 Gone` with `problem+json`; the client drops it.
  - Sessions expire before the window: an unfinished session can be resumed (`GET /v1/sessions/{id}`) for at most **7 days** after `started_at`, then the server closes it.
- Deletion: the table carries `user_id` and has RLS, so the account-deletion cascade (§7.8) removes its rows. → arch §7.5

### Concurrency and out-of-order answers

- Each trace update takes a row lock (`SELECT … FOR UPDATE`). → arch §7.5
- An answer newer than the trace's `last_review_at` is applied directly. → arch §7.5
- If an incoming answer is older than an answer already applied, the trace is rebuilt by replaying its whole history. All of its scheduling events (`counts_for_scheduling = true`) are read from `review_event` in `occurred_at` order and passed through the scheduler again, starting from the trace's creation state (lesson, self-report, placement or import, kept on `memory_trace`). Rebuild runs in the same transaction and lock. → arch §7.5
- Checkpoints for archived history. Before `db.maintenance` archives old partitions to Parquet, it writes each affected trace's state to `memory.trace_checkpoint`. A replay starts from the trace's latest checkpoint, or from its creation state if it has none. The boundary is defined in `occurred_at` terms: → arch §7.5
  - Definition. A checkpoint `as_of` holds the trace state after applying, in `occurred_at` order, every scheduling event with `occurred_at < as_of`, wherever it is stored (Parquet or live table). It never includes an event with `occurred_at ≥ as_of`.
  - Replay from a checkpoint applies exactly events with `occurred_at ≥ as_of`; query: `occurred_at ≥ as_of AND received_at ≥ as_of`. (`received_at ≥ occurred_at`, so nothing is lost; partitions older than `as_of` are skipped).
  - Finality. A checkpoint is written only once `as_of` is at least **29 days** in the past. `occurred_at` ≥ session start − 24 h and session start ≥ receipt − 28 days (§7.5 Pruning), so `occurred_at ≥ received_at − 29 days`. In practice `as_of` is the 90-day archive boundary.
  - Archiving: partitions are archived by `received_at`, only if the whole range ends before `as_of`. Every archived event has `occurred_at ≤ received_at < as_of`, so it is inside the checkpoint. Late arrivals with `occurred_at < as_of` stay live; replay ignores them.
  - Scheduler version change: checkpoints are recomputed offline from the union of the Parquet archive and live rows with `occurred_at < as_of`.
- With no checkpoint, the replay bound is `received_at ≥ memory_trace.created_at`. → arch §7.5
- `pre_*` / `post_*` columns are historical: state as applied when received. Replay neither rewrites nor reads them. `memory_trace` holds the authoritative current state. → arch §7.5
- Insights don't use stored `pre_r` directly: the nightly job (§7.6) recomputes each review's predicted R with the current scheduler version before residuals (§5.3). The incremental job uses the stored value only for traces with no replay since their last nightly recompute (`replayed_at` marks them). → arch §7.5
- Replay changes only scheduling state; XP and classifier labels are kept. → arch §7.5
- XP and streak credit go to the learning day the answer occurred in if still open (days close 6 hours after they end), else the day received. A closed day is never reopened. → arch §7.5
- Client timestamps are clamped: they cannot be later than `received_at`, and they cannot fall more than 24 hours before the session started. → arch §7.5
