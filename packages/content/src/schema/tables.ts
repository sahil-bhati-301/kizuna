import {
  boolean,
  integer,
  jsonb,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { contentSchema as c, provenance } from './common.js';

// No foreign keys to other schemas. Foreign keys inside `content` are kept where the
// target is never deleted (referenced content is deprecated and redirected, arch §3.1).

/** Immutable once written (enforced by a trigger, see the custom migration). */
export const contentRelease = c.table('content_release', {
  semver: text('semver').primaryKey(),
  sourceManifest: jsonb('source_manifest').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  ...provenance,
});

export const radical = c.table('radical', {
  number: smallint('number').primaryKey(), // Kangxi 1-214
  literal: text('literal').notNull(),
  variantForms: text('variant_forms').array().notNull().default([]),
  strokes: smallint('strokes'),
  ...provenance,
});

export const kanji = c.table('kanji', {
  literal: text('literal').primaryKey(),
  codepoint: integer('codepoint').notNull(),
  strokes: smallint('strokes').notNull(),
  radicalNumber: smallint('radical_number')
    .notNull()
    .references(() => radical.number),
  grade: smallint('grade'),
  jlptApprox: smallint('jlpt_approx'),
  freqRank: integer('freq_rank'),
  isJoyo: boolean('is_joyo').notNull().default(false),
  meanings: jsonb('meanings').notNull().default([]), // [{ lang, text }], dictionary-derived
  ...provenance,
});

export const component = c.table('component', {
  slug: text('slug').primaryKey(),
  glyph: text('glyph').notNull(),
  kanjiVgId: text('kanjivg_id'), // for glyphs with no Unicode code point
  kanjiLiteral: text('kanji_literal').references(() => kanji.literal),
  radicalNumber: smallint('radical_number').references(() => radical.number),
  strokes: smallint('strokes'),
  ...provenance,
});

export const kanjiComponent = c.table(
  'kanji_component',
  {
    kanjiLiteral: text('kanji_literal')
      .notNull()
      .references(() => kanji.literal),
    componentSlug: text('component_slug')
      .notNull()
      .references(() => component.slug),
    position: text('position').notNull(), // hen, tsukuri, kanmuri, ashi, tare, nyō, kamae, ...
    role: text('role').notNull(), // semantic | phonetic | form | unknown
    depth: smallint('depth').notNull(),
    ord: smallint('ord').notNull(),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.kanjiLiteral, t.componentSlug, t.depth, t.ord] })],
);

export const reading = c.table('reading', {
  id: text('id').primaryKey(), // e.g. 生:on:せい
  kanjiLiteral: text('kanji_literal')
    .notNull()
    .references(() => kanji.literal),
  kind: text('kind').notNull(), // on | kun | nanori
  kana: text('kana').notNull(),
  okurigana: text('okurigana'),
  isJoyo: boolean('is_joyo').notNull().default(false),
  isCore: boolean('is_core').notNull().default(false),
  isPrimaryOfKind: boolean('is_primary_of_kind').notNull().default(false),
  usageWeight: real('usage_weight').notNull().default(0),
  ...provenance,
});

export const word = c.table('word', {
  entSeq: integer('ent_seq').primaryKey(), // JMdict ent_seq
  headword: text('headword').notNull(),
  kana: text('kana').notNull(),
  altForms: jsonb('alt_forms').notNull().default([]),
  senses: jsonb('senses').notNull().default([]), // [{ pos, glosses: [{ lang, text }] }]
  freqRank: integer('freq_rank'),
  isCommon: boolean('is_common').notNull().default(false),
  jlptApprox: smallint('jlpt_approx'),
  ...provenance,
});

export const wordKanji = c.table(
  'word_kanji',
  {
    wordEntSeq: integer('word_ent_seq')
      .notNull()
      .references(() => word.entSeq),
    position: smallint('position').notNull(),
    kanjiLiteral: text('kanji_literal')
      .notNull()
      .references(() => kanji.literal),
    readingId: text('reading_id').references(() => reading.id),
    surfaceKana: text('surface_kana'),
    phenomenon: text('phenomenon').notNull(), // regular | rendaku | sokuon | jukujikun | ateji | irregular
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.wordEntSeq, t.position] })],
);

export const sentence = c.table('sentence', {
  id: text('id').primaryKey(), // source ID (Tatoeba)
  japanese: text('japanese').notNull(),
  translations: jsonb('translations').notNull().default([]),
  wordIds: integer('word_ids').array().notNull().default([]),
  quality: real('quality'),
  ...provenance,
});

export const relation = c.table(
  'relation',
  {
    fromType: text('from_type').notNull(),
    fromId: text('from_id').notNull(),
    toType: text('to_type').notNull(),
    toId: text('to_id').notNull(),
    kind: text('kind').notNull(),
    weight: real('weight').notNull(),
    directed: boolean('directed').notNull().default(false),
    origin: text('origin').notNull(), // curated | computed | empirical
    evidence: jsonb('evidence'),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.fromType, t.fromId, t.toType, t.toId, t.kind] })],
);

export const featureTag = c.table(
  'feature_tag',
  {
    itemType: text('item_type').notNull(),
    itemId: text('item_id').notNull(),
    tag: text('tag').notNull(),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.itemType, t.itemId, t.tag] })],
);

/** Our own keywords, kept apart from dictionary-derived rows (pipeline spec: original content in separate tables). */
export const itemKeyword = c.table(
  'item_keyword',
  {
    itemType: text('item_type').notNull(), // kanji | radical | component
    itemId: text('item_id').notNull(),
    keyword: text('keyword').notNull(),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.itemType, t.itemId] })],
);

export const mnemonic = c.table('mnemonic', {
  id: uuid('id').primaryKey(),
  kanjiLiteral: text('kanji_literal')
    .notNull()
    .references(() => kanji.literal),
  text: text('text').notNull(),
  author: text('author').notNull(), // system | user
  visibility: text('visibility').notNull(),
  ...provenance,
});

export const idRedirect = c.table('id_redirect', {
  oldId: text('old_id').primaryKey(),
  newId: text('new_id').notNull(),
  releaseSemver: text('release_semver').notNull(),
  ...provenance,
});
