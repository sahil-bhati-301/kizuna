/**
 * Review queue build (W02-5 AC 3-5): parses the pinned sources, runs the cross-checks, and renders
 * the queue as YAML. Takes file contents, so tests run on fixtures; `cli.ts` does the file reading.
 */
import { stringify, parse } from 'yaml';
import { buildQueue, parseUnihanStrokes, queueDocument } from '../domain/crosscheck/index.ts';
import type { Decision, Queue, VgInfo } from '../domain/crosscheck/index.ts';
import { importKanjidic, importKanjivg, importKradfile } from '../import/index.ts';

export interface ReviewSources {
  readonly kanjidic: Iterable<string> | AsyncIterable<string>;
  /** The Jōyō TSV. */
  readonly joyo: string;
  readonly kradfile: Uint8Array;
  readonly kanjivg: Iterable<string> | AsyncIterable<string>;
  /** Unihan text holding the kTotalStrokes lines. */
  readonly unihan: string;
  /** Contents of decisions.yaml (may be empty). */
  readonly decisions: string;
}

export interface ReviewResult {
  readonly queue: Queue;
  /** The queue file, byte-stable for the same sources. */
  readonly yaml: string;
}

const PROVENANCE = { source: 'review', sourceVersion: 'n/a', license: 'n/a' };

export class DecisionsError extends Error {}

/** Parses decisions.yaml: `decisions:` is a list of {id, decision: accept|flag, reason, author}. */
export function parseDecisions(text: string): Decision[] {
  const doc = parse(text) as { decisions?: unknown } | null;
  const list = doc?.decisions ?? [];
  if (!Array.isArray(list)) throw new DecisionsError('decisions.yaml: "decisions" must be a list');
  const seen = new Set<string>();
  return list.map((raw: Record<string, unknown>, i) => {
    const d = raw ?? {};
    const label = `decisions.yaml: entry #${i + 1}`;
    for (const f of ['id', 'reason', 'author'])
      if (typeof d[f] !== 'string' || !d[f]) throw new DecisionsError(`${label} needs "${f}"`);
    if (d.decision !== 'accept' && d.decision !== 'flag')
      throw new DecisionsError(`${label} "decision" must be accept or flag`);
    if (seen.has(d.id as string)) throw new DecisionsError(`${label} repeats ${String(d.id)}`);
    seen.add(d.id as string);
    return d as unknown as Decision;
  });
}

export async function buildReview(src: ReviewSources): Promise<ReviewResult> {
  const kd = await importKanjidic({
    kanjidic: src.kanjidic,
    joyo: src.joyo,
    provenance: PROVENANCE,
  });
  const krad = importKradfile(src.kradfile, PROVENANCE);
  const vg = await importKanjivg(src.kanjivg, PROVENANCE);

  const glyphOf = new Map(vg.components.map((c) => [c.slug, c.glyph]));
  const kanjivg = new Map<string, VgInfo>();
  const comps = new Map<string, { slug: string; glyph: string; depth: number }[]>();
  for (const r of vg.kanjiComponents) {
    const list = comps.get(r.kanjiLiteral) ?? [];
    list.push({
      slug: r.componentSlug,
      glyph: glyphOf.get(r.componentSlug) ?? r.componentSlug,
      depth: r.depth,
    });
    comps.set(r.kanjiLiteral, list);
  }
  for (const s of vg.strokes)
    kanjivg.set(s.kanji, { components: comps.get(s.kanji) ?? [], strokes: s.strokes });

  const queue = buildQueue(
    {
      kanji: kd.kanji
        .filter((k) => k.isJoyo)
        .map((k) => ({ literal: k.literal, strokes: k.strokes, freqRank: k.freqRank })),
      krad: new Map(krad.kanji.map((k) => [k.literal, k.components.map((c) => c.component)])),
      kanjivg,
      unihan: parseUnihanStrokes(src.unihan),
    },
    parseDecisions(src.decisions),
  );
  return {
    queue,
    yaml: stringify(queueDocument(queue), { lineWidth: 0, aliasDuplicateObjects: false }),
  };
}
