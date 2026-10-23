// The diagnostic test blueprint. Coverage is planned so every detector gets evidence:
// lookalike pairs with the partner on the card, component families with several members,
// on + kun on the same kanji, and word readings for kanji also tested alone.
import type { ContentSet, KanjiId, WordId } from '@kizuna/content';
import type { Question, QuestionType } from './contracts';
import { type ContentIndex, byCodePoint, getIndex } from './contentIndex';
import { type QuestionSpec, canAsk, draftQuestion, usableWords } from './distractors';
import { buildQuestion } from './questions';
import { type Rng, mulberry32, rngFor, shuffle } from './rng';

export const TEST_MIX: Record<QuestionType, number> = {
  meaning: 16,
  reading_on: 12,
  reading_kun: 10,
  recognition: 12,
  word_reading: 10,
};
const MIX_TOTAL = 60;

export const BLUEPRINT_CONFIG = {
  /** Families to cover, and questions per family (scaled by length / 60). */
  families: 3,
  familyQuestions: [8, 6, 6],
  familyMembers: 5,
  /** Kanji that get both an on'yomi and a kun'yomi question. */
  dualReadingKanji: 8,
  /** Wanted opportunities per visual pair (partner on the card). */
  visualOpportunities: 2,
  semanticOpportunities: 1,
};

const TYPE_ORDER: QuestionType[] = ['meaning', 'reading_on', 'reading_kun', 'recognition', 'word_reading'];

function scaledMix(length: number): Record<QuestionType, number> {
  const raw = TYPE_ORDER.map((t) => (TEST_MIX[t] * length) / MIX_TOTAL);
  const out = raw.map(Math.floor);
  let rest = length - out.reduce((a, b) => a + b, 0);
  const byFrac = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let j = 0; rest > 0; j = (j + 1) % byFrac.length, rest--) out[byFrac[j].i]++;
  return Object.fromEntries(TYPE_ORDER.map((t, i) => [t, out[i]])) as Record<QuestionType, number>;
}

class Planner {
  readonly items: QuestionSpec[] = [];
  readonly budget: Record<QuestionType, number>;
  private readonly seen = new Set<string>();
  constructor(
    readonly ix: ContentIndex,
    length: number,
    /** Seeded variety: which members, pairs order, words and fill kanji. */
    readonly rng: Rng,
  ) {
    this.budget = scaledMix(length);
  }
  key(s: QuestionSpec): string {
    return s.type === 'word_reading' ? `w|${s.wordId}` : `${s.type}|${s.kanji}`;
  }
  has(type: QuestionType, k: KanjiId): boolean {
    return this.seen.has(`${type}|${k}`);
  }
  hasWord(w: WordId): boolean {
    return this.seen.has(`w|${w}`);
  }
  get remaining(): number {
    return TYPE_ORDER.reduce((a, t) => a + this.budget[t], 0);
  }
  /** Add the first viable type from `types` for kanji k. Returns the added spec. */
  add(types: QuestionType[], k: KanjiId, extra: Partial<QuestionSpec> = {}): QuestionSpec | null {
    for (const type of types) {
      if (this.budget[type] <= 0) continue;
      const spec: QuestionSpec = { type, kanji: k, ...extra };
      if (type === 'word_reading' && !spec.wordId) continue;
      if (this.seen.has(this.key(spec))) continue;
      if (type !== 'word_reading' && !canAsk(this.ix, type, k)) continue;
      if (!draftQuestion(this.ix, spec, mulberry32(1))) continue;
      this.items.push(spec);
      this.seen.add(this.key(spec));
      this.budget[type]--;
      return spec;
    }
    return null;
  }
  kanjiCount(k: KanjiId): number {
    return this.items.filter((s) => s.kanji === k && s.type !== 'word_reading').length;
  }
}

/** Does the partner actually land on the card for this spec? */
function partnerAppears(ix: ContentIndex, spec: QuestionSpec, partner: KanjiId): boolean {
  const d = draftQuestion(ix, { ...spec, partner }, mulberry32(1));
  return !!d && d.options.some((o) => o.fromKanji === partner);
}

function planFamilies(p: Planner, length: number): void {
  const ix = p.ix;
  const chosen: KanjiId[][] = [];
  for (const fam of ix.rankedFamilies) {
    if (chosen.length >= BLUEPRINT_CONFIG.families) break;
    const pool = fam.members.slice(0, BLUEPRINT_CONFIG.familyMembers + 2);
    const members = shuffle(pool, p.rng).slice(0, BLUEPRINT_CONFIG.familyMembers);
    const overlaps = chosen.some((c) => members.filter((m) => c.includes(m)).length * 3 >= members.length * 2);
    if (overlaps) continue;
    chosen.push(members);
    const target = Math.max(4, Math.round(((BLUEPRINT_CONFIG.familyQuestions[chosen.length - 1] ?? 5) * length) / MIX_TOTAL));
    const prefs: QuestionType[] = ['meaning', 'reading_on', 'reading_kun', 'recognition'];
    let added = members.reduce((a, m) => a + p.kanjiCount(m), 0);
    let progress = true;
    while (added < target && progress) {
      progress = false;
      for (const m of members) {
        if (added >= target) break;
        const rotated = prefs.slice(p.kanjiCount(m) % prefs.length).concat(prefs.slice(0, p.kanjiCount(m) % prefs.length));
        if (p.add(rotated, m)) {
          added++;
          progress = true;
        }
      }
    }
  }
}

function planDualReadings(p: Planner): void {
  const ix = p.ix;
  const both = ix.ordered.filter((k) => canAsk(ix, 'reading_on', k.id) && canAsk(ix, 'reading_kun', k.id)).map((k) => k.id);
  const inVisual = new Set(ix.content.relations.filter((r) => r.kind === 'visual').flatMap((r) => [r.a, r.b]));
  const score = (k: KanjiId) => (p.has('reading_on', k) ? 2 : 0) + (p.has('reading_kun', k) ? 2 : 0) + (p.kanjiCount(k) > 0 ? 1 : 0) + (inVisual.has(k) ? 0.5 : 0);
  const order = both
    .map((k, i) => ({ k, i: i + p.rng() * both.length * 0.5, s: score(k) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
  let dual = order.filter((k) => p.has('reading_on', k) && p.has('reading_kun', k)).length;
  for (const k of order) {
    if (dual >= BLUEPRINT_CONFIG.dualReadingKanji) break;
    if (p.has('reading_on', k) && p.has('reading_kun', k)) continue;
    const needOn = !p.has('reading_on', k);
    const needKun = !p.has('reading_kun', k);
    if ((needOn && p.budget.reading_on <= 0) || (needKun && p.budget.reading_kun <= 0)) continue;
    if (needOn) p.add(['reading_on'], k);
    if (needKun) p.add(['reading_kun'], k);
    if (p.has('reading_on', k) && p.has('reading_kun', k)) dual++;
  }
}

function planRelations(p: Planner, kind: 'visual' | 'semantic', wanted: number): void {
  const ix = p.ix;
  const rels = ix.content.relations
    .filter((r) => r.kind === kind && ix.kanji.has(r.a) && ix.kanji.has(r.b) && r.a !== r.b)
    .map((r) => ({ r, s: r.strength + p.rng() * 0.15 }))
    .sort((x, y) => y.s - x.s || byCodePoint(x.r.a + x.r.b, y.r.a + y.r.b))
    .map((x) => x.r);
  const covered = (a: KanjiId, b: KanjiId) =>
    p.items.filter((s) => s.type !== 'word_reading' && ((s.kanji === a && onCard(ix, s, b)) || (s.kanji === b && onCard(ix, s, a)))).length;
  const prefs: QuestionType[] = kind === 'visual' ? ['recognition', 'meaning', 'reading_on', 'reading_kun'] : ['meaning', 'recognition', 'reading_kun'];
  for (let pass = 1; pass <= wanted; pass++) {
    for (const r of rels) {
      if (covered(r.a, r.b) >= pass) continue;
      // Direction: the first pass asks for a, the second for b.
      const dirs: Array<[KanjiId, KanjiId]> = pass % 2 === 1 ? [[r.a, r.b], [r.b, r.a]] : [[r.b, r.a], [r.a, r.b]];
      let done = false;
      for (const [x, y] of dirs) {
        // Reuse an existing unforced item on x.
        const reuse = p.items.find(
          (s) => s.kanji === x && !s.partner && s.type !== 'word_reading' && partnerAppears(ix, s, y) && keepsCoverage(ix, s, y),
        );
        if (reuse) {
          reuse.partner = y;
          done = true;
          break;
        }
        const viable = prefs.filter((t) => !p.has(t, x) && canAsk(ix, t, x) && partnerAppears(ix, { type: t, kanji: x }, y));
        if (p.add(viable, x, { partner: y })) {
          done = true;
          break;
        }
      }
      if (!done && p.remaining <= 0) return;
    }
  }
}

/** Forcing `partner` onto s keeps every related kanji that was already on its card. */
function keepsCoverage(ix: ContentIndex, s: QuestionSpec, partner: KanjiId): boolean {
  const before = draftQuestion(ix, s, mulberry32(1));
  const after = draftQuestion(ix, { ...s, partner }, mulberry32(1));
  if (!before || !after) return false;
  const was = before.options.filter((o) => o.source === 'visual' || o.source === 'semantic').map((o) => o.fromKanji);
  return was.every((k) => after.options.some((o) => o.fromKanji === k));
}

/** Is the partner on the card for this spec as planned? */
function onCard(ix: ContentIndex, s: QuestionSpec, partner: KanjiId): boolean {
  const d = draftQuestion(ix, s, mulberry32(1));
  return !!d && d.options.some((o) => o.fromKanji === partner);
}

function planWords(p: Planner): void {
  const ix = p.ix;
  const tested = [...new Set(p.items.filter((s) => s.type !== 'word_reading').map((s) => s.kanji))];
  const order = tested
    .map((k, i) => ({ k, i, n: p.kanjiCount(k), r: ix.ordered.findIndex((x) => x.id === k) }))
    .sort((a, b) => b.n - a.n || a.r - b.r || a.i - b.i)
    .map((x) => x.k);
  for (let pass = 0; pass < 2 && p.budget.word_reading > 0; pass++) {
    const focusUsed = new Set(p.items.filter((s) => s.type === 'word_reading').map((s) => s.kanji));
    for (const k of order) {
      if (p.budget.word_reading <= 0) break;
      if (pass === 0 && focusUsed.has(k)) continue;
      const free = usableWords(ix, k).filter((id) => !p.hasWord(id));
      const w = free[Math.floor(p.rng() * Math.min(3, free.length))];
      if (w) p.add(['word_reading'], k, { wordId: w });
    }
  }
}

function planFill(p: Planner): void {
  const ix = p.ix;
  // Mostly frequency order, with seeded jitter so different seeds cover different kanji.
  const ordered = ix.ordered
    .map((k, i) => ({ k, key: i + p.rng() * ix.ordered.length * 0.4 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.k);
  for (let guard = 0; guard < 4 && p.remaining > 0; guard++) {
    for (const type of TYPE_ORDER) {
      for (const breadth of [true, false]) {
        for (const k of ordered) {
          if (p.budget[type] <= 0) break;
          if (breadth && p.kanjiCount(k.id) > 0) continue;
          if (type === 'word_reading') {
            if (p.kanjiCount(k.id) === 0 && breadth) continue;
            const w = usableWords(ix, k.id).find((id) => !p.hasWord(id));
            if (w) p.add(['word_reading'], k.id, { wordId: w });
          } else if (!p.has(type, k.id)) {
            p.add([type], k.id);
          }
        }
      }
    }
    // Move budget the content cannot fill to types that still have capacity.
    const stuck = TYPE_ORDER.filter((t) => p.budget[t] > 0);
    if (stuck.length === 0) break;
    const spare = stuck.reduce((a, t) => a + p.budget[t], 0);
    for (const t of stuck) p.budget[t] = 0;
    const capacity = TYPE_ORDER.filter((t) =>
      ix.ordered.some((k) => (t === 'word_reading' ? usableWords(ix, k.id).some((w) => !p.hasWord(w)) : !p.has(t, k.id) && canAsk(ix, t, k.id))),
    );
    if (capacity.length === 0) break;
    for (let i = 0; i < spare; i++) p.budget[capacity[i % capacity.length]]++;
  }
}

/** Shuffle, then break up runs of the same kanji. */
export function spreadByKanji<T>(items: T[], kanjiOf: (t: T) => string): T[] {
  const out = items.slice();
  for (let i = 1; i < out.length; i++) {
    if (kanjiOf(out[i]) !== kanjiOf(out[i - 1])) continue;
    for (let j = i + 1; j < out.length; j++) {
      const kj = kanjiOf(out[j]);
      if (kj !== kanjiOf(out[i - 1]) && (i + 1 >= out.length || kj !== kanjiOf(out[i + 1]) || j === i + 1)) {
        [out[i], out[j]] = [out[j], out[i]];
        break;
      }
    }
  }
  return out;
}

export function planTest(content: ContentSet, length: number, seed = 1): QuestionSpec[] {
  const ix = getIndex(content);
  const p = new Planner(ix, length, rngFor(seed, 'plan'));
  planFamilies(p, length);
  planDualReadings(p);
  planRelations(p, 'visual', BLUEPRINT_CONFIG.visualOpportunities);
  planRelations(p, 'semantic', BLUEPRINT_CONFIG.semanticOpportunities);
  planWords(p);
  planFill(p);
  return p.items;
}

export function createTest(content: ContentSet, opts?: { seed?: number; length?: number }): Question[] {
  const seed = opts?.seed ?? 1;
  const length = Math.max(1, Math.round(opts?.length ?? 60));
  const ix = getIndex(content);
  const specs = spreadByKanji(shuffle(planTest(content, length, seed), rngFor(seed, 'order')), (s) => s.kanji);
  const out: Question[] = [];
  for (const spec of specs) {
    const idx = out.length;
    const q = buildQuestion(ix, spec, `t-${idx}-${spec.type}-${spec.kanji}`, rngFor(seed, 'q', idx, spec.type, spec.kanji));
    if (q) out.push(q);
  }
  return out;
}
