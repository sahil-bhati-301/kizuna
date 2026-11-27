# STATUS

Phase 0 · Week W02 (Pipeline II: components, words, alignment) · planned and approved · Updated: session 12 (/plan-week W02)
Light: 🟢 green at session 11 start (week 30%, 5h 26%). Run /budget with /usage figures at the start and end of every session.

## Next step
- Run `/wp W02-2` (day 1). Plan approved and all W02 OPEN-Qs answered in session 12 (every recommendation taken).
- W01 retro done: measured ≈2% per M-eq, capacity ≈30 M-eq (coarse). Schedule kept; W02 is planned at 8 M-eq (§2.7), the surplus is reserve.
- Need from the owner: a /usage figure at the end of session 11 (W01-7 and the retro have no end reading).

## Active WPs
- (none started; W02 plan: W02-1 to W02-6, 5.5 M-eq)

## Merged in W01 (all 7 WPs)
- W01-1 Pipeline app, sources lock, fetcher (PR #9) · W01-6 kernel domain/ (PR #10)
- W01-4 Normalisation library (PR #11) · W01-2 content schema and types (PR #12)
- W01-3 KANJIDIC2 parser and Jōyō import (PR #13) · W01-5 KRADFILE parser (PR #14)
- W01-7 CI hygiene: Node 24 actions, .nvmrc (PR #15)

## Owner tasks
- O-3, O-4, O-5: done.
- O-6 (W01): re-verify the KANJIDIC2 and KRADFILE licences at source. Open; needed before the W03 release.
- W02 hosts: allowed by the owner in session 12. Tatoeba and Unicode download; GitHub release files (KanjiVG, JmdictFurigana) are still refused by the session's git proxy (W02 Q-G).
- O-7 (W02 day 5): triage the first review queue.
- W02 Q-G: done (session 12). The owner uploaded content/sources/JmdictFurigana.txt (12.2 MB, uncompressed, UTF-8 with BOM, 237,062 lines, all `text|reading|furigana`). Release dated 2026-11-25. KanjiVG is bundled by W02-1 from a pinned commit.

## Blockers
- (none)

## OPEN-Q
- (none open; W02 Q-G answered in session 12)

## Last decisions
- W02 plan (session 12): all recommendations taken. Sources: commit compressed files under content/sources/; a file over 50 MB gets a filtered subset with the upstream checksum pinned. JMdict: all-language JMdict.gz, entries with any priority tag. W02-5 is M (adds Unihan); W02-6 added.
- W01 retro: calibration factor 0.24 (≈2.0% per M-eq against the planned 7.5%). Keep the schedule; do not pull work forward in the first month.
- W01-7: actions on checkout@v7, setup-node@v7, cache@v6, pnpm/action-setup@v6. Node comes from `.nvmrc` (22); `engines.node` stays `>=22`.
- W01-5: plain 月 stays 月 (radical null); KRADFILE has no ⺼, so W02 must not assume ⺼ from it. Provenance comes from the caller (W03-5).
- W01-3: reading IDs keep okurigana and affix markers (`食:kun:た.べる`, `生:kun:なま-`). Jōyō matching tries the exact form, then the bare kana; ambiguous fallbacks flag nothing and are reported. The Jōyō TSV comes from the official 2010 PDF.
- W01-2: content migrations live in packages/persistence/drizzle/; keywords are a separate `item_keyword` table (owner may revert to a column).
- W01-4: 月 as 肉 is keyed ⺼; ヴ/ヵ/ヶ convert by offset; a trailing `-` marks a prefix.
- Sources are committed under content/sources/; the Jōyō table is a checked-in TSV.
- Plan: docs/development-plan.md is the source for workflow; docs/architecture-design.md wins design conflicts.
- Cloud sessions cannot push wp/ branches: each WP works on its session branch.
- Local DB: `pnpm db:up`, `pnpm db:migrate`, `pnpm db:down`. In a cloud session, start Docker with `dockerd &` before the harness test.

## Flaky tests
- None
