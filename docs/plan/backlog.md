# Backlog

Out-of-scope finds go here, not into code. One line each, with the WP that found it.

## Should-fix
- (W00-5 OQ-1, owner decision session 4) kernel: move pure code under packages/kernel/src/domain/ so the repo-wide domain lint and dependency-cruiser rules cover it; replace the source-scan stand-in. Done: W01-6.

## Ideas
- (W00-4) spec cross-check: optional allowlist so intended duplicate numbers stop showing, then fail on new duplicates.
- (W00-4) budget guard: the tool-call fallback fired WRAP-UP while the owner reported low usage; consider a higher fallback or prompting for /budget figures first.
- (W00-6) cloud environment: start dockerd in the environment setup script so the Testcontainers harness runs in cloud sessions without a manual step.

## Deferred
- (W00-1 review) dependency-cruiser: add an apps-to-apps boundary rule once apps/ exists. Planned: W01-1.
- (W00-1 review) dependency-cruiser: widen the domain-no-io banned module list (currently partial).
- (W00-2) CI: bump actions/checkout, setup-node, cache and pnpm/action-setup to Node 24 majors (v4 warns about Node 20 deprecation). Planned: W01-7.
- (W00-2) CI: add .nvmrc or engines.node so local and CI Node versions come from one place. Planned: W01-7.
- (W01-6 review) dependency-cruiser: add a repo-level fixture test that cruises a deliberate I/O import from a domain/ file, so the domain-no-io rule is proven end to end (purity.test.ts used to do this for kernel only).
- (W00-5) kernel: production ID generators need a crypto-seeded `Rng` wired at the composition root; `createSeededRng` is 32-bit and not secure.
