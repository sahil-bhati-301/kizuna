import type { ErrorClass, Facet, KanjiStage, Pattern } from '@kizuna/core';

/** A random 31-bit seed. UI only: the core stays deterministic for a given seed. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** 0.734 → "73%". */
export function pct(x: number): string {
  if (!Number.isFinite(x)) return '–';
  return `${Math.round(clamp01(x) * 100)}%`;
}

/** Signed percentage points: -12.4 → "−12 pp". */
export function pp(deltaPp: number): string {
  if (!Number.isFinite(deltaPp)) return '–';
  const r = Math.round(deltaPp);
  if (r === 0) return '±0 pp';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} pp`;
}

/** Signed change between two 0–1 accuracies, in points. */
export function deltaPoints(before: number, after: number): number {
  return (after - before) * 100;
}

export function abilityLabel(ability: number, accuracy: number): { label: string; blurb: string } {
  // θ is on the logit scale; accuracy keeps the label honest when θ is extreme on few answers.
  const score = Number.isFinite(ability) ? ability : 0;
  if (score >= 2 || accuracy >= 0.92) return { label: 'N5 ready', blurb: 'You know most of the N5 set already.' };
  if (score >= 1 || accuracy >= 0.8) return { label: 'Strong beginner', blurb: 'A solid base with a few loose threads.' };
  if (score >= 0 || accuracy >= 0.6) return { label: 'Steady learner', blurb: 'Good footing, and clear places to grow.' };
  if (score >= -1 || accuracy >= 0.4) return { label: 'Finding your footing', blurb: 'The basics are forming. Keep going.' };
  return { label: 'Just getting started', blurb: 'Everyone starts here. Every answer helps us map it.' };
}

export const FACET_LABELS: Record<Facet, string> = {
  meaning: 'Meaning',
  reading_on: "On'yomi",
  reading_kun: "Kun'yomi",
  recognition: 'Recognition',
  context: 'In words',
};

export function facetLabel(f: Facet): string {
  return FACET_LABELS[f] ?? f;
}

export const STAGES: KanjiStage[] = ['solid', 'learning', 'shaky', 'weak', 'untested'];

export const STAGE_LABELS: Record<KanjiStage, string> = {
  untested: 'Not tested',
  weak: 'Weak',
  shaky: 'Shaky',
  learning: 'Learning',
  solid: 'Solid',
};

export const STAGE_HINTS: Record<KanjiStage, string> = {
  solid: 'Reliably right',
  learning: 'Mostly right',
  shaky: 'Hit and miss',
  weak: 'Often wrong',
  untested: 'No answers yet',
};

export function stageLabel(s: KanjiStage): string {
  return STAGE_LABELS[s] ?? s;
}

export function confidenceLabel(c: number): string {
  if (c >= 0.9) return 'Very likely';
  if (c >= 0.75) return 'Likely';
  if (c >= 0.5) return 'Possible';
  return 'Tentative';
}

export const ERROR_CLASS_LABELS: Record<ErrorClass, string> = {
  VISUAL_CONFUSION: 'Lookalike mix-up',
  SEMANTIC_CONFUSION: 'Related-meaning mix-up',
  SHARED_COMPONENT_CONFUSION: 'Shared-part mix-up',
  READING_KIND_SWAP: "On/kun swap",
  CONTEXT_MISREAD: 'Misread in a word',
  RANDOM_ERROR: 'Miss',
  DONT_KNOW: "Didn't know",
};

export const PATTERN_TYPE_LABELS: Record<Pattern['type'], string> = {
  component_family: 'Component family',
  visual_confusion: 'Lookalikes',
  semantic_confusion: 'Related meanings',
  reading_kind: 'Reading type',
  context_gap: 'Words in context',
  weak_kanji: 'Weak kanji',
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return 'Unknown error';
  }
}
