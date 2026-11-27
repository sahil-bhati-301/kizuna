#!/usr/bin/env node
// PostToolUse formatter: prettier (and eslint --fix) on the edited file, if installed. Always exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const file = input.tool_input && input.tool_input.file_path;
  if (file && fs.existsSync(file)) {
    const root = input.cwd || process.cwd();
    const bin = (n) => path.join(root, 'node_modules', '.bin', n);
    const run = (n, args) => {
      if (!fs.existsSync(bin(n))) return;
      try {
        execFileSync(bin(n), args, { cwd: root, stdio: 'ignore', timeout: 20000 });
      } catch {}
    };
    run('prettier', ['--write', file]);
    run('eslint', ['--fix', file]);
  }
} catch {}
process.exit(0);
