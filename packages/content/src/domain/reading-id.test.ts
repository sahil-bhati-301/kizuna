import { describe, expect, it } from 'vitest';
import { buildReadingId, parseReadingId } from './reading-id.js';

describe('reading ID', () => {
  it('builds 生:on:せい', () => {
    expect(buildReadingId({ kanji: '生', kind: 'on', kana: 'せい' })).toBe('生:on:せい');
  });
  it('round-trips', () => {
    for (const parts of [
      { kanji: '生', kind: 'on', kana: 'せい' },
      { kanji: '生', kind: 'kun', kana: 'い.きる' },
      { kanji: '生', kind: 'on', kana: '-せい' },
      { kanji: '生', kind: 'kun', kana: 'なま-' },
      { kanji: '青', kind: 'nanori', kana: 'あお' },
    ] as const) {
      expect(parseReadingId(buildReadingId(parts))).toEqual(parts);
    }
  });
  it('throws on colons and empty parts', () => {
    expect(() => buildReadingId({ kanji: '生', kind: 'on', kana: 'a:b' })).toThrow();
    expect(() => buildReadingId({ kanji: 'a:b', kind: 'on', kana: 'せい' })).toThrow();
    expect(() => buildReadingId({ kanji: '', kind: 'on', kana: 'せい' })).toThrow();
    expect(() => buildReadingId({ kanji: '生', kind: 'on', kana: '' })).toThrow();
  });
  it('rejects malformed IDs', () => {
    for (const bad of ['', '生', '生:on', '生:foo:せい', '生:on:せい:x', '生:on:a:b', ':on:せい'])
      expect(parseReadingId(bad)).toBeUndefined();
  });
});
