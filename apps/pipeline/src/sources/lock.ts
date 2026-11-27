import { parse } from 'yaml';

export interface SourceEntry {
  id: string;
  url: string;
  version: string;
  fetched: string;
  file: string;
  sha256: string;
  license: string;
}

export interface SourcesLock {
  sources: SourceEntry[];
}

const FIELDS = ['id', 'url', 'version', 'fetched', 'file', 'sha256', 'license'] as const;

export class LockSchemaError extends Error {}

/** Validates a parsed lock document; throws LockSchemaError naming the entry and field. */
export function validateLock(doc: unknown): SourcesLock {
  const sources = (doc as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new LockSchemaError('sources.lock.yaml: "sources" must be a non-empty list');
  }
  const seen = new Set<string>();
  for (const [i, raw] of sources.entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const label = typeof entry.id === 'string' && entry.id ? entry.id : `#${i}`;
    for (const field of FIELDS) {
      const v = entry[field];
      if (typeof v !== 'string' || v.trim() === '') {
        throw new LockSchemaError(`sources.lock.yaml: entry ${label} is missing "${field}"`);
      }
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 as string)) {
      throw new LockSchemaError(`sources.lock.yaml: entry ${label} has an invalid sha256`);
    }
    if (!/^https?:\/\//.test(entry.url as string)) {
      throw new LockSchemaError(`sources.lock.yaml: entry ${label} has an invalid url`);
    }
    if (!/^[\w.-]+$/.test(entry.file as string)) {
      throw new LockSchemaError(`sources.lock.yaml: entry ${label} has an invalid file name`);
    }
    if (seen.has(label)) {
      throw new LockSchemaError(`sources.lock.yaml: duplicate entry ${label}`);
    }
    seen.add(label);
  }
  return { sources: sources as SourceEntry[] };
}

export function parseLock(text: string): SourcesLock {
  return validateLock(parse(text));
}

/**
 * A source built locally from a pinned upstream commit (W02 Q-G answer a): listed under `bundled:`,
 * so `sources:fetch` and `sources:pin` never download it (like the `transcribed:` entries). The
 * sha256 is of the committed file; `commit` is the upstream commit it was built from.
 */
export interface BundledEntry extends SourceEntry {
  commit: string;
}

/** Validates the `bundled:` list (may be absent); throws LockSchemaError naming entry and field. */
export function validateBundled(doc: unknown): BundledEntry[] {
  const bundled = (doc as { bundled?: unknown } | null)?.bundled;
  if (bundled === undefined || bundled === null) return [];
  if (!Array.isArray(bundled)) {
    throw new LockSchemaError('sources.lock.yaml: "bundled" must be a list');
  }
  validateLock({ sources: bundled });
  for (const raw of bundled as Record<string, unknown>[]) {
    if (typeof raw.commit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.commit)) {
      throw new LockSchemaError(`sources.lock.yaml: entry ${String(raw.id)} has an invalid commit`);
    }
  }
  return bundled as BundledEntry[];
}

export function parseBundled(text: string): BundledEntry[] {
  return validateBundled(parse(text));
}
