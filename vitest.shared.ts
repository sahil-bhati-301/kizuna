import { defineConfig } from 'vitest/config';

// Dot reporter and silent output; bail locally (CI sets CI=true to see every failure).
// The JSON report feeds scripts/verify-summary.mjs.
export default defineConfig({
  test: {
    reporters: ['dot', 'json'],
    outputFile: { json: '.vitest-report.json' },
    silent: true,
    bail: process.env.CI ? 0 : 1,
  },
});
