import { defineConfig } from 'drizzle-kit';

// Module schemas: content (W01-2); add W05-3's files when they exist.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./packages/content/src/schema/tables.ts', './packages/content/src/schema/common.ts'],
  out: './packages/persistence/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://kizuna:kizuna@localhost:5432/kizuna',
  },
});
