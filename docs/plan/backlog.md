# Backlog

Out-of-scope finds go here, not into code. One line each, with the WP that found it.

## Should-fix
- (W00-5 OQ-1, owner decision session 4) kernel: move pure code under packages/kernel/src/domain/ so the repo-wide domain lint and dependency-cruiser rules cover it; replace the source-scan stand-in. Done: W01-6.

## Ideas
- (W01-4 review) markers: `parseReading` accepts inner or doubled hyphens as stem text (`--た`, `た--`, `た-べる`); decide whether they should be a typed error. Owner call before W01-3 relies on it.
- (W01-4 review) kana: half-width katakana (U+FF66–FF9F) and Small Kana Extension (U+1B130–1B16F) pass through unconverted and are not in KANA_EXCEPTIONS; list them or normalise half-width at the parser edge. Also not normalised: the Kangxi Radicals block (⽔ etc.).
- (W01-4) radicals: 月 as 肉→130 is keyed as ⺼ (U+2EBC) because plain 月 is radical 74. KRADFILE uses plain 月, so W01-3 and W01-5 must decide how to map it.
- (W00-4) spec cross-check: optional allowlist so intended duplicate numbers stop showing, then fail on new duplicates.
- (W00-4) budget guard: the tool-call fallback fired WRAP-UP while the owner reported low usage; consider a higher fallback or prompting for /budget figures first.
- (W01-7) CI: pnpm/action-setup@v6 self-installs pnpm v11, then switches to v10.28.0 from `packageManager` and warns about the PNPM_HOME layout. Harmless; it goes away when the repo moves to pnpm 11 (or pin the action's `version`).
- (W01 retro) budget guard: every budget-log row still has `?` for weekly start/end, so calibration used hand-typed /budget readings. Find why the guard gets no usage data in cloud sessions.
- (W00-6) cloud environment: start dockerd in the environment setup script so the Testcontainers harness runs in cloud sessions without a manual step.

## Deferred
- (W02 planning) KanjiVG stroke SVGs for the web (validation needs a stroke SVG per teachable kanji): W02-1 parses only the tree and stroke counts; W03-5 static chunks must export them.
- (W02 planning) review queue: add W02-3 irregular alignments as queue items once the queue format exists.
- (W00-1 review) dependency-cruiser: add an apps-to-apps boundary rule once apps/ exists. Planned: W01-1.
- (W00-1 review) dependency-cruiser: widen the domain-no-io banned module list (currently partial).
- (W00-2) CI: bump actions/checkout, setup-node, cache and pnpm/action-setup to Node 24 majors (v4 warns about Node 20 deprecation). Done: W01-7.
- (W00-2) CI: add .nvmrc or engines.node so local and CI Node versions come from one place. Done: W01-7.
- (W01-6 review) dependency-cruiser: add a repo-level fixture test that cruises a deliberate I/O import from a domain/ file, so the domain-no-io rule is proven end to end (purity.test.ts used to do this for kernel only).
- (W00-5) kernel: production ID generators need a crypto-seeded `Rng` wired at the composition root; `createSeededRng` is 32-bit and not secure.
- (W01-3) sources lock: nothing verifies the new `transcribed:` entries yet. Add a check that each checked-in file's sha256 matches its lock entry (CI or `sources:verify`).
- (W01-3 review) Nine Jōyō readings are absent from KANJIDIC2 and are only reported (塞, 羨, 曽 ゾ, 速, 中 ジュウ, 丼 どん, 務, 踊, 絡). Decide whether the pipeline adds them as Jōyō-sourced reading rows.
- (W01-3) The Jōyō 付表 (special word readings) is not imported. It is a candidate input for the words work (W02).
- (W02-2) The XML tokenizer is duplicated between domain/kanjidic and domain/jmdict (candidate for a shared lib).
- (W02-2) stagk and stagr are ignored by the W02-2 parser; W02-3 alignment should consider them.
