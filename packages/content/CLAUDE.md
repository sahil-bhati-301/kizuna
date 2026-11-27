# content: rules for Claude

Read-only linguistic knowledge: Drizzle schema `content` and row types (arch §3.1, §7.5). Depends on nothing but drizzle-orm. Query API and release index come later.

## Public API (`src/index.ts` only)
- Tables (`kanji`, `radical`, `component`, `kanjiComponent`, `reading`, `word`, `wordKanji`, `sentence`, `relation`, `featureTag`, `itemKeyword`, `mnemonic`, `contentRelease`, `idRedirect`), row types (`Kanji`, `NewKanji`, ...), `buildReadingId`, `parseReadingId`.

## Rules
- Every table carries `source`, `source_version`, `license` (spread `provenance`).
- No foreign keys to other schemas. Our own keywords live in `item_keyword`, mnemonics in `mnemonic`; never mix them into dictionary-derived tables.
- `content_release` is immutable: DB triggers reject UPDATE, DELETE and TRUNCATE (migration `0002_content_release_immutable.sql`). Keep it when regenerating.
- Migrations are written to `packages/persistence/drizzle/` by the root `drizzle.config.ts`; hand-written ones use `drizzle-kit generate --custom`.
- `src/domain/` is pure. The integration test is `packages/persistence/test/content-schema.test.ts` (it uses the Docker harness).
