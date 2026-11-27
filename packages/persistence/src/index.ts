import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** Absolute path of the migrations folder written by drizzle-kit. */
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies every pending migration to the database behind `pool`. */
export async function runMigrations(pool: Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder });
}
