import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { skipReason, startTestDatabase, type TestDatabase } from './harness.js';

const reason = skipReason();
if (reason) console.warn(`[persistence] skipping harness test: ${reason}`);

describe.skipIf(reason !== undefined)('testcontainers harness', () => {
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

  it('connects and migrates an empty database', async () => {
    const { rows } = await tx.client.query('SELECT 1 AS one');
    expect(rows[0].one).toBe(1);
    const migrations = await tx.client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS t",
    );
    expect(migrations.rows[0].t).not.toBeNull();
  });

  it('creates, inserts, rolls back and then sees a clean state', async () => {
    await tx.client.query('CREATE TABLE harness_sample (id int PRIMARY KEY)');
    await tx.client.query('INSERT INTO harness_sample VALUES (1)');
    const { rows } = await tx.client.query('SELECT count(*)::int AS n FROM harness_sample');
    expect(rows[0].n).toBe(1);
    await tx.rollback();
    tx = await db.begin();
    const after = await tx.client.query("SELECT to_regclass('harness_sample') AS t");
    expect(after.rows[0].t).toBeNull();
  });

  it('starts the next test with a fresh transaction', async () => {
    const { rows } = await tx.client.query("SELECT to_regclass('harness_sample') AS t");
    expect(rows[0].t).toBeNull();
  });
});
