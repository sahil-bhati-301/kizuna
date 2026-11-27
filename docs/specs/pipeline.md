# pipeline: spec digest
Source: docs/architecture-design.md. The architecture doc wins any conflict.
Covers: §3.3, §3.4, §8.7 (content pipeline and data quality, data sources and licensing, where ML and LLMs fit)

## §3.3 Content pipeline and data quality

Stages, in order (flow: pinned sources to published release). → arch §3.3

1. Pinned sources (`sources.lock.yaml`). → arch §3.3
2. Parse. → arch §3.3
3. Normalise: NFC · kana · okurigana markers · radical variants. → arch §3.3
4. Align and enrich: furigana alignment · Jōyō flags · reading usage weights. → arch §3.3
5. Compute relations and feature tags. → arch §3.3
6. Apply overrides. → arch §3.3
7. Validate: rules + diff vs last release. → arch §3.3
8. On issues: review queue, then edit overrides (YAML in git), then apply overrides again and re-validate. → arch §3.3
9. On pass: publish release: DB load · static chunks · attribution manifest · CC BY-SA dataset. → arch §3.3

Rules:

- **Determinism.** Source versions and checksums are pinned in `content/sources.lock.yaml`. The same inputs must produce a byte-identical release, and CI checks this. → arch §3.3
- **Normalisation.** Apply Unicode NFC. Store kana in hiragana and display on'yomi in katakana. Parse KANJIDIC okurigana markers (`た.べる` becomes stem `た` plus okurigana `べる`) and affix markers (`-`). Separate nanori. Map radical variants (氵 → #85 水). → arch §3.3
- **Teach set.** Start with the 2,136 Jōyō kanji. Mark official readings from the Jōyō table, because KANJIDIC lists many rare readings that must not be drilled. → arch §3.3
- **Alignment.** Use JmdictFurigana to split each word's reading across its kanji. Words that cannot be aligned are tagged `irregular`. They stay learnable, but they are excluded from reading-attribution statistics. → arch §3.3
- **Cross-checks.** Compare KanjiVG and KRADFILE decompositions, and Unihan and KANJIDIC stroke counts. Disagreements go to the review queue. → arch §3.3

### Validation rules, enforced in CI

- Every teachable kanji has a keyword, at least one core reading, a decomposition and a stroke SVG. → arch §3.3
- No relation edge points at a missing item. → arch §3.3
- Every curriculum word has an aligned reading. → arch §3.3
- Every teachable kanji has at least one aligned curriculum word for each core primary reading where one exists in the loaded word set. Kanji with none are listed in the release report (they fall back to the meaning-only Mastered rule, §4.6). → arch §3.3
- The release diff (added, removed and changed counts per table) is reviewed before publishing. → arch §3.3

### Overrides, reports and release upgrades

- **Overrides.** Human corrections live in `content/overrides/*.yaml` in git. Each one records a reason and an author, is applied last, and survives re-imports. → arch §3.3
- **User reports.** Every item has a "Report an issue" button. Reports go to a triage queue, become an override, and ship in the next release. → arch §3.3
- **Release upgrades.** A worker job migrates traces that point at redirected IDs. New teachable items flow into the curriculum. Learner history is never invalidated. → arch §3.3

### Changes in meaning, not just in ID

A release can change what an existing trace *refers to* without renaming anything: for example a different reading becomes `is_primary_of_kind`, a reading loses `is_core`, or a word's alignment changes. The release diff lists these changes and the traces they affect. A migration rule applies per case: → arch §3.3

- Context and word-meaning traces are word-level, so they are unaffected by a primary-reading change. → arch §3.3
- An isolated reading trace (when that facet is enabled) whose primary reading changed is **retired**. It is kept in history and excluded from scheduling. A new trace for the new primary reading starts from the lesson state. → arch §3.3
- A trace for a reading that is no longer core is suspended, not deleted. → arch §3.3
- Insights recompute affected group statistics from the event log on the next nightly run. → arch §3.3

## §3.4 Data sources and licensing

| Source | Used for | License (re-verify at import) | Obligations and notes |
|---|---|---|---|
| KANJIDIC2 (EDRDG) | kanji metadata, readings, meanings, grade, frequency | CC BY-SA 4.0 | Attribution and licence link. Share-alike on derived data. |
| JMdict (EDRDG) | vocabulary, senses, commonness tags | CC BY-SA 4.0 | Same as KANJIDIC2 |
| KRADFILE / RADKFILE (EDRDG) | component decomposition | EDRDG licence (CC BY-SA 4.0) | Same as KANJIDIC2 |
| KanjiVG | stroke-order SVGs, nested element tree with positions | CC BY-SA 3.0 | Attribution. Modified SVGs stay BY-SA. |
| JmdictFurigana | per-kanji reading alignment | CC BY-SA (inherits JMdict) | Same as JMdict |
| Tatoeba | example sentences and translations | CC BY 2.0 FR (some CC0) | Per-sentence attribution (link to the sentence or its author) |
| Unihan (Unicode) | radical-stroke and stroke-count cross-checks | Unicode License | Include the notice |
| Jōyō kanji table (Agency for Cultural Affairs, 2010) | teach set, official readings | Cabinet notice, generally outside copyright under Art. 13 of the Japanese Copyright Act | Cite the source |
| Community JLPT lists | approximate level tags | Varies by list | Label them as *approximate*. JLPT has published no official kanji lists since 2010. |
| Princeton WordNet / Japanese WordNet | seeds for semantic relations | Permissive WordNet-style licences | Attribution |
| Noto Sans JP, Noto Serif JP, Klee One | UI and drill fonts | SIL OFL 1.1 | Ship the licence file |
| Audio (TTS vendor or recordings) | word audio | Vendor terms, or work-for-hire | The terms must allow storing and redistributing the audio. Record the licence per asset. |

→ arch §3.4

### Obligations and policy

- A credits page (`/credits`), an attribution footer on every public kanji page, and a licence file inside every data export. → arch §3.4
- **Share-alike.** The dictionary-derived linguistic layer is CC BY-SA. We accept that and publish the derived dataset with each release. Our original content (keywords, mnemonics, semantic tags, explanations) stays in separate tables and files with explicit provenance, so its licensing can be decided independently. Get a legal review before launch; this document is not legal advice. → arch §3.4
- **Never ingest** commercial course content (for example WaniKani mnemonics and level structure, or Heisig keywords and stories), textbook vocabulary lists, scraped sites, or proprietary frequency corpora used without a licence. → arch §3.4
- Every content row carries `source`, `source_version` and `license`, so the credits page and the dataset manifest are generated rather than maintained by hand. → arch §3.4

## §8.7 Where ML and LLMs fit, and where they don't

| Stage | Technique | Purpose |
|---|---|---|
| v1 | FSRS, Beta/Binomial statistics, empirical-Bayes logistic offsets, Rasch-style difficulty | Scheduling, uncertainty, weakness detection, priors. All deterministic and explainable. |
| Phase 3 | Per-user FSRS optimisation (gradient-based fitting) | Better-calibrated schedules |
| Phase 4 | Population confusion mining (counting statistics) | `empirical_confusable` edges |
| Phase 4 | Glyph-image similarity (rendered in several fonts, offline embedding), with human review | Better `visual_similar` candidates |
| Phase 4 | Knowledge-tracing challenger with skill features (PFA or DAS3H-style logistic model), in shadow mode | Transfer priors for new items; replaces heuristics only if it wins on log-loss |
| Phase 4 | Thompson sampling over intervention templates | Picks the most effective drill per hypothesis type |
| Offline authoring, any phase | LLM drafts with **human review**: mnemonics, semantic tags, example sentences at a controlled level, graded passages | Content scale. Every draft is checked by machine (tokeniser coverage, readings against JMdict) before review, and its provenance is stored. |
| Phase 5, online | LLM for free-text meaning equivalence (fallback after deterministic accept-lists, cached), grammar explanations, phrasing insight text from structured evidence | Only where the output can be bounded or verified |
| **Never** | LLM grading of readings, LLM scheduling decisions, LLM-invented evidence | Correctness and explainability |

→ arch §8.7

- Every LLM use sits behind an `AuthoringAssistant` or `ExplanationAssistant` adapter interface, so providers and models can change and every use can be tested with fixtures. → arch §8.7
