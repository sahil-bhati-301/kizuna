# Backlog

Out-of-scope finds go here, not into code. One line each, with the WP that found it.

## Should-fix

## Ideas

## Deferred
- (W00-1 review) dependency-cruiser: add an apps-to-apps boundary rule once apps/ exists.
- (W00-1 review) dependency-cruiser: widen the domain-no-io banned module list (currently partial).
- (W00-2) CI: bump actions/checkout, setup-node, cache and pnpm/action-setup to Node 24 majors (v4 warns about Node 20 deprecation).
- (W00-2) CI: add .nvmrc or engines.node so local and CI Node versions come from one place.
- (W00-5) kernel: production ID generators need a crypto-seeded `Rng` wired at the composition root; `createSeededRng` is 32-bit and not secure.
