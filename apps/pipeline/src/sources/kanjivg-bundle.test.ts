/** W02-1: KanjiVG bundle slicing, reproducible gzip and the `bundled:` lock section. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { bundleKanjivg, gzipReproducible, sliceKanjivgSvg } from './kanjivg-bundle.ts';
import { LockSchemaError, parseBundled, parseLock, validateBundled } from './lock.ts';

const svg = (hex: string, crlf = false) => {
  const text =
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- licence -->\n<!DOCTYPE svg [\n]>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="109">\n` +
    `<g id="kvg:StrokePaths_${hex}" style="fill:none">\n<g id="kvg:${hex}" kvg:element="一">\n` +
    `\t<path id="kvg:${hex}-s1" d="M0,0"/>\n</g>\n</g>\n` +
    `<g id="kvg:StrokeNumbers_${hex}" style="font-size:8">\n</g>\n</svg>\n`;
  return crlf ? text.replaceAll('\n', '\r\n') : text;
};
const SLICE =
  '<kanji id="kvg:kanji_04e00">\n<g id="kvg:04e00" kvg:element="一">\n' +
  '\t<path id="kvg:04e00-s1" d="M0,0"/>\n</g>\n</kanji>\n';
const META = { commit: 'a'.repeat(40), date: '2026-11-18' };

describe('kanjivg bundle', () => {
  it('slices the StrokePaths content into a <kanji> element, as kvg.py release() does', () => {
    expect(sliceKanjivgSvg('04e00.svg', svg('04e00'))).toBe(SLICE);
    expect(sliceKanjivgSvg('04e00.svg', svg('04e00', true))).toBe(SLICE);
  });

  it('rejects a file without the stroke groups', () => {
    expect(() => sliceKanjivgSvg('x.svg', '<svg ></svg>')).toThrow(/StrokePaths/u);
  });

  it('keeps base files only, sorted by name, under one header', () => {
    const xml = bundleKanjivg(
      [
        { name: '04e01.svg', svg: svg('04e01') },
        { name: '04e00-Kaisho.svg', svg: svg('04e00-Kaisho') },
        { name: '04e00.svg', svg: svg('04e00') },
      ],
      META,
    );
    expect(xml.match(/<kanji id="[^"]+"/gu)).toEqual([
      '<kanji id="kvg:kanji_04e00"',
      '<kanji id="kvg:kanji_04e01"',
    ]);
    expect(xml.match(/<!--/gu)).toHaveLength(1);
    expect(xml).toContain(`commit ${META.commit} (2026-11-18)`);
    expect(xml.endsWith('</kanji>\n</kanjivg>\n')).toBe(true);
  });

  it('gzips to the same bytes every time, with no name and mtime 0', () => {
    const xml = bundleKanjivg([{ name: '04e00.svg', svg: svg('04e00') }], META);
    const a = gzipReproducible(xml);
    const b = gzipReproducible(xml);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect([...a.subarray(3, 10)]).toEqual([0, 0, 0, 0, 0, 2, 255]);
    expect(gunzipSync(a).toString('utf8')).toBe(xml);
  });
});

describe('bundled lock entries', () => {
  const lockText = readFileSync(
    new URL('../../../../content/sources.lock.yaml', import.meta.url),
    'utf8',
  );

  it('pins kanjivg under bundled:, outside the fetched sources', () => {
    expect(parseLock(lockText).sources.map((s) => s.id)).not.toContain('kanjivg');
    const [kanjivg] = parseBundled(lockText);
    expect(kanjivg).toMatchObject({
      id: 'kanjivg',
      file: 'kanjivg.xml.gz',
      license: 'CC BY-SA 3.0',
    });
    const file = readFileSync(
      new URL(`../../../../content/sources/${kanjivg!.file}`, import.meta.url),
    );
    expect(createHash('sha256').update(file).digest('hex')).toBe(kanjivg!.sha256);
  });

  it('rejects a bundled entry without a commit or with a missing field', () => {
    const entry = {
      id: 'x',
      url: 'https://example.org',
      version: 'v',
      fetched: '2026-11-27',
      file: 'x.gz',
      sha256: 'f'.repeat(64),
      license: 'CC BY-SA 3.0',
    };
    expect(validateBundled({})).toEqual([]);
    expect(() => validateBundled({ bundled: [entry] })).toThrow(LockSchemaError);
    expect(() =>
      validateBundled({ bundled: [{ ...entry, commit: 'b'.repeat(40), url: '' }] }),
    ).toThrow(/missing "url"/u);
    expect(validateBundled({ bundled: [{ ...entry, commit: 'b'.repeat(40) }] })).toHaveLength(1);
  });
});
