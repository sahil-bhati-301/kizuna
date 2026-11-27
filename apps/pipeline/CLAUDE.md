# pipeline: rules for Claude

Content pipeline CLI (pipeline.md §8.2): import → normalise → enrich → validate → publish. Only the sources stage exists so far (W01-1).

## Sources (`src/sources/`, public API `index.ts`)
- `content/sources.lock.yaml` pins each source: `id, url, version, fetched, file, sha256, license` (all required; `validateLock`/`parseLock` reject gaps). The sha256 is of the compressed file.
- Compressed files are committed under `content/sources/` (owner decision), with `README.md` attribution (CC BY-SA 4.0, EDRDG). Never gitignore them.
- `fetchSource`: a stored file matching the pin is a cache hit with no network. Otherwise download, verify, store; a mismatch throws `ChecksumMismatchError` naming the source and the re-pin command, and the CLI exits 1.
- `pinSource`: unconditional download that returns the new sha256; the CLI `pin` writes it and the date into the lock.
- Commands: `pnpm --filter @kizuna/pipeline sources:fetch [id]`, `sources:pin [id]`. Behind the agent proxy set `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- `bundled:` entries (KanjiVG) are built from a pinned upstream commit, validated by `parseBundled` (adds `commit`) and never fetched: `pnpm --filter @kizuna/pipeline kanjivg:bundle <clone>` rebuilds `kanjivg.xml.gz` byte for byte. `transcribed:` (Jōyō) is not parsed by code.
- Full-file smoke runs: `jmdict:run`, `kanjivg:run`.
- CLI files run under Node type stripping: no parameter properties, no enums, `.ts` import suffixes.

## Rules
- Tests use a local HTTP stub, never the real network.
- An app may not import another app (dependency-cruiser `no-app-to-app`).
- Other sources (KanjiVG, JMdict, ...) are W02.
