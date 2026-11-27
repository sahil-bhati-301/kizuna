import { defineConfig } from 'drizzle-kit';

// Module schemas arrive with W01-2 and W05-3; add their files to `schema` then.
export default defineConfig({
  dialect: 'postgresql',
  schema: [],
  out: './packages/persistence/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://kizuna:kizuna@localhost:5432/kizuna',
  },
});
