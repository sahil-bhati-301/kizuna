import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './run.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

process.exitCode = await run(process.argv.slice(2), {
  lockPath: join(root, 'content/sources.lock.yaml'),
  sourcesDir: join(root, 'content/sources'),
  today: new Date().toISOString().slice(0, 10),
});
