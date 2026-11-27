import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

// Review follow-up for W00-5 (AC2, AC5). The frozen spec tests stay in boundaries.test.ts.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sources = readdirSync(here, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(join(here, f), 'utf8') }));
const filesMatching = (re: RegExp) => sources.filter((s) => re.test(s.text)).map((s) => s.file);

describe('source scan (AC2)', () => {
  it('no kernel source calls new Date() without arguments', () => {
    expect(filesMatching(/\bnew\s+Date\s*\(\s*\)/)).toEqual([]);
  });

  it('only clock.ts reads Date.now, including computed access', () => {
    const readers = filesMatching(/\bDate\s*(\.\s*now\b|\?\.\s*now\b|\[\s*['"`]now['"`]\s*\])/);
    expect(readers).toEqual(['clock.ts']);
  });

  it('no kernel source reads Math.random, including computed access', () => {
    expect(
      filesMatching(/\bMath\s*(\.|\?\.)\s*random\b|\bMath\s*\[\s*['"`]random['"`]\s*\]/),
    ).toEqual([]);
  });
});

describe('dependency-cruiser on a fixture (AC5)', () => {
  it('reports domain-no-io for a domain/ file that imports an I/O module, and only there', async () => {
    const config = createRequire(import.meta.url)(join(repoRoot, '.dependency-cruiser.cjs'));
    const dir = mkdtempSync(join(tmpdir(), 'kizuna-depcruise-'));
    // The rule matches '/src/domain/', so the fixture needs a parent folder, as in packages/<name>/.
    try {
      mkdirSync(join(dir, 'pkg/src/domain'), { recursive: true });
      mkdirSync(join(dir, 'pkg/src/infra'), { recursive: true });
      writeFileSync(
        join(dir, 'pkg/src/domain/reads-disk.ts'),
        "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n",
      );
      writeFileSync(join(dir, 'pkg/src/domain/pure.ts'), 'export const x = 1;\n');
      writeFileSync(
        join(dir, 'pkg/src/infra/disk.ts'),
        "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n",
      );
      const { output } = await cruise(['pkg'], {
        baseDir: dir,
        validate: true,
        ruleSet: { forbidden: config.forbidden },
        tsPreCompilationDeps: true,
      });
      const result = output as ICruiseResult;
      const hits = result.summary.violations.map((v) => ({
        rule: v.rule.name,
        from: v.from,
        to: v.to,
      }));
      expect(hits).toEqual([
        {
          rule: 'domain-no-io',
          from: 'pkg/src/domain/reads-disk.ts',
          to: expect.stringMatching(/^(node:)?fs$/),
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
