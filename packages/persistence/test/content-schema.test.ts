import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { skipReason, startTestDatabase, type TestDatabase } from './harness.js';

const reason = skipReason();
if (reason) console.warn(`[persistence] skipping content schema test: ${reason}`);

const P = `'test', '1', 'CC0'`;

describe.skipIf(reason !== undefined)('content schema', () => {
  let db: TestDatabase;
  let tx: Awaited<ReturnType<TestDatabase['begin']>>;

  beforeAll(async () => {
    db = await startTestDatabase();
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });
  beforeEach(async () => {
    tx = await db.begin();
  });
  afterEach(async () => {
    await tx.rollback();
  });

  const inserts: Record<string, string> = {
    radical: `INSERT INTO content.radical (number, literal, variant_forms, source, source_version, license) VALUES (85, '水', '{氵}', ${P})`,
    kanji: `INSERT INTO content.kanji (literal, codepoint, strokes, radical_number, source, source_version, license) VALUES ('生', 29983, 5, 85, ${P})`,
    component: `INSERT INTO content.component (slug, glyph, kanji_literal, source, source_version, license) VALUES ('sei', '生', '生', ${P})`,
    kanji_component: `INSERT INTO content.kanji_component (kanji_literal, component_slug, position, role, depth, ord, source, source_version, license) VALUES ('生', 'sei', 'hen', 'form', 0, 0, ${P})`,
    reading: `INSERT INTO content.reading (id, kanji_literal, kind, kana, source, source_version, license) VALUES ('生:on:せい', '生', 'on', 'せい', ${P})`,
    word: `INSERT INTO content.word (ent_seq, headword, kana, source, source_version, license) VALUES (1358280, '生徒', 'せいと', ${P})`,
    word_kanji: `INSERT INTO content.word_kanji (word_ent_seq, position, kanji_literal, reading_id, phenomenon, source, source_version, license) VALUES (1358280, 0, '生', '生:on:せい', 'regular', ${P})`,
    sentence: `INSERT INTO content.sentence (id, japanese, source, source_version, license) VALUES ('t1', '生徒です。', ${P})`,
    relation: `INSERT INTO content.relation (from_type, from_id, to_type, to_id, kind, weight, origin, source, source_version, license) VALUES ('kanji', '生', 'kanji', '性', 'phonetic_series', 0.5, 'curated', ${P})`,
    feature_tag: `INSERT INTO content.feature_tag (item_type, item_id, tag, source, source_version, license) VALUES ('kanji', '生', 'grade:1', ${P})`,
    item_keyword: `INSERT INTO content.item_keyword (item_type, item_id, keyword, source, source_version, license) VALUES ('kanji', '生', 'life', ${P})`,
    mnemonic: `INSERT INTO content.mnemonic (id, kanji_literal, text, author, visibility, source, source_version, license) VALUES (gen_random_uuid(), '生', 'a sprout', 'system', 'public', ${P})`,
    content_release: `INSERT INTO content.content_release (semver, source_manifest, source, source_version, license) VALUES ('1.0.0', '{}', ${P})`,
    id_redirect: `INSERT INTO content.id_redirect (old_id, new_id, release_semver, source, source_version, license) VALUES ('1', '2', '1.0.0', ${P})`,
  };

  it('inserts and reads back one row per table, with provenance', async () => {
    for (const sql of Object.values(inserts)) await tx.client.query(sql);
    for (const table of Object.keys(inserts)) {
      const { rows } = await tx.client.query(
        `SELECT source, source_version, license FROM content.${table}`,
      );
      expect(rows).toEqual([{ source: 'test', source_version: '1', license: 'CC0' }]);
    }
  });

  it('has no foreign keys leaving the content schema', async () => {
    const { rows } = await tx.client.query(
      `SELECT count(*)::int AS n FROM pg_constraint c
       JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
       JOIN pg_class t ON t.oid = c.confrelid JOIN pg_namespace m ON m.oid = t.relnamespace
       WHERE c.contype = 'f' AND n.nspname = 'content' AND m.nspname <> 'content'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('rejects updates to content_release', async () => {
    await tx.client.query(inserts.content_release!);
    await expect(
      tx.client.query(`UPDATE content.content_release SET is_current = true`),
    ).rejects.toThrow(/immutable/);
  });
});
