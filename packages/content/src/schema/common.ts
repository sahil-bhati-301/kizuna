import { pgSchema, text } from 'drizzle-orm/pg-core';

export const contentSchema = pgSchema('content');

/** Provenance carried by every content row (pipeline spec, arch §3.4). */
export const provenance = {
  source: text('source').notNull(),
  sourceVersion: text('source_version').notNull(),
  license: text('license').notNull(),
};
