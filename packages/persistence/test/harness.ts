import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../src/index.js';

export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Skip reason when Docker is absent locally; undefined when the tests should run.
 * In CI (CI=true) a missing Docker is a failure, never a skip.
 */
export function skipReason(): string | undefined {
  if (process.env.CI || dockerAvailable()) return undefined;
  return 'Docker daemon not available: Testcontainers needs Docker (this skip is disabled in CI)';
}

export interface TestDatabase {
  pool: pg.Pool;
  /** Opens a transaction on a dedicated client; call `rollback` to discard everything. */
  begin(): Promise<{ client: pg.PoolClient; rollback(): Promise<void> }>;
  stop(): Promise<void>;
}

/** Starts an isolated Postgres, applies migrations, and returns handles to it. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool);
  return {
    pool,
    async begin() {
      const client = await pool.connect();
      await client.query('BEGIN');
      return {
        client,
        async rollback() {
          try {
            await client.query('ROLLBACK');
          } finally {
            client.release();
          }
        },
      };
    },
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}
