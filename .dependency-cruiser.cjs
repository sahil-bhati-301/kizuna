/** Module-boundary rules from docs/architecture-design.md §2.3 and §8.2. */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'The package graph has no cycles (arch 2.3).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'module-public-api-only',
      comment: "A module's only import path is its src/index.ts (arch 2.3, 8.2).",
      severity: 'error',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: {
        path: '^packages/([^/]+)/(src/)?',
        pathNot: [
          '^$1/$2/',
          '^packages/[^/]+/src/index\\.ts$',
          // drills/grading is a separate public entry (also used by web).
          '^packages/drills/(src/)?grading/index\\.ts$',
        ],
      },
    },
    {
      name: 'domain-not-to-infra',
      comment: 'domain/ imports nothing from infra/ (arch 8.2).',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: { path: '/src/infra/' },
    },
    {
      name: 'domain-not-to-app',
      comment: 'domain/ is the innermost layer; it does not reach into app/.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: { path: '/src/app/' },
    },
    {
      name: 'domain-no-io',
      comment:
        'domain/ is pure: no I/O modules (arch 2.3). Date.now and Math.random are caught by ESLint.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        dependencyTypes: [
          'core',
          'npm',
          'npm-dev',
          'npm-peer',
          'npm-optional',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
        ],
        path: '^(node:)?(fs|fs/promises|net|http|https|http2|tls|dns|child_process|cluster|worker_threads)$|node_modules/(pg|pg-boss|fastify|undici|axios)(/|$)',
      },
    },
    {
      name: 'contracts-imports-no-domain-module',
      comment: 'contracts imports only kernel types and Zod (arch 2.3).',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/(content|memory|insights|drills|account|ui|sim)/' },
    },
    {
      name: 'no-app-to-app',
      comment: 'An app may not import another app (arch 8.2).',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'web-allow-list',
      comment:
        'apps/web may import only contracts, drills/grading, content types and ui (arch 8.2).',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/(contracts|content|ui)/', '^packages/drills/(src/)?grading/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '(^|/)(dist|\\.turbo)/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
