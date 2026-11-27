import { describe, expect, it } from 'vitest';
import { joinReading, parseReading } from './markers.ts';

function ok(input: string) {
  const r = parseReading(input);
  if (!r.ok) throw new Error(`expected ok for ${input}, got ${r.error.kind}`);
  return r.value;
}

describe('parseReading (AC 3)', () => {
  it('splits た.べる into stem た and okurigana べる', () => {
    expect(ok('た.べる')).toEqual({ stem: 'た', okurigana: 'べる', prefix: false, suffix: false });
  });

  it('gives empty okurigana when there is no dot', () => {
    expect(ok('たべる')).toEqual({ stem: 'たべる', okurigana: '', prefix: false, suffix: false });
  });

  it('a leading and a trailing - set different affix flags, and neither stays in the stem', () => {
    const lead = ok('-あ');
    const trail = ok('あ-');
    expect(lead.stem).toBe('あ');
    expect(trail.stem).toBe('あ');
    expect(lead.prefix !== lead.suffix).toBe(true);
    expect(trail.prefix !== trail.suffix).toBe(true);
    expect(lead.prefix).toBe(!trail.prefix);
    expect(ok('-あ-')).toMatchObject({ stem: 'あ', prefix: true, suffix: true });
  });

  it('keeps okurigana with an affix marker', () => {
    expect(ok('-た.べる')).toMatchObject({ stem: 'た', okurigana: 'べる' });
  });

  it.each(['た.べ.る', 'た..べる'])(
    'returns a multiple-dots error for %s without throwing',
    (input) => {
      const r = parseReading(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('multiple-dots');
    },
  );

  it.each(['.べる', '', '-', '-.べる'])(
    'returns an empty-stem error for "%s" without throwing',
    (input) => {
      const r = parseReading(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('empty-stem');
    },
  );

  it('property: every valid parse re-joins to its input', () => {
    const stems = ['た', 'あたら', 'ショク', 'う'];
    const okuri = ['', '.べる', '.しい', '.む'];
    for (const pre of ['', '-'])
      for (const stem of stems)
        for (const o of okuri)
          for (const post of ['', '-']) {
            const input = `${pre}${stem}${o}${post}`;
            const r = parseReading(input);
            expect(r.ok, input).toBe(true);
            if (r.ok) expect(joinReading(r.value)).toBe(input);
          }
  });
});
